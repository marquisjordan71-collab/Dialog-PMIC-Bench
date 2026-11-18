import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
  ALL_DEVICE_PROFILES,
  FIRMWARE_CATALOG,
  MANUAL_CATALOG,
  type ManualDocument,
} from './src/utils/pmicCatalog.ts';
import { matchFirmwareForPart, matchManualsForPart } from './src/utils/pmicProtocol.ts';
import { generateManualPdf } from './src/utils/pdfGenerator.ts';
import {
  createDefaultRateList,
  executeRateListUpdateSweep,
  shouldRunMidnightUpdate,
  type AutoUpdateScheduleState,
  type RateListEntry,
} from './src/utils/rateListUpdater.ts';
import { computeOwnerSealText, isBlockedSourcePath } from './src/utils/appProtection.ts';
import { createSecurityManager, type ConfigureSecurityInput } from './src/utils/serverSecurity.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

async function checkOfficialSourceReachability(url: string): Promise<'verified' | 'local-archive'> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(1400),
      headers: {
        'User-Agent': 'Dialog-PMIC-Bench/1.0',
      },
    });
    if (res.ok || res.status === 405 || res.status === 403) {
      return 'verified';
    }
    return 'local-archive';
  } catch {
    return 'local-archive';
  }
}

function findManualById(docId: string, partQuery?: string): ManualDocument | undefined {
  const exact = MANUAL_CATALOG.find((m) => m.id === docId);
  if (exact) return exact;

  if (partQuery) {
    const generated = matchManualsForPart(partQuery);
    const match = generated.find((m) => m.id === docId);
    if (match) return match;
  }

  // Reconstruct from custom-<part>-<type>
  if (docId.startsWith('custom-')) {
    const parts = docId.replace(/^custom-/, '').split('-');
    const partCode = (parts[0] ?? 'DA9063').toUpperCase();
    const candidates = matchManualsForPart(partCode);
    return candidates.find((m) => m.id === docId) ?? candidates[0];
  }

  return undefined;
}

function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

function extractSessionToken(req: express.Request): string | null {
  const headerToken = req.header('x-app-session');
  if (headerToken) return headerToken.trim();
  const auth = req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return extractCookieValue(req.headers.cookie, 'pmic_bench_session');
}

function getClientKey(req: express.Request): string {
  const fwd = req.header('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
}

function setSessionCookie(res: express.Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `pmic_bench_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${
      isProd ? '; Secure' : ''
    }`,
  );
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader(
    'Set-Cookie',
    'pmic_bench_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  );
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const security = createSecurityManager();
  const isProdMode = process.env.NODE_ENV === 'production';

  // Global security headers & raw source / map / secret protection
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }

    if (isBlockedSourcePath(req.path, isProdMode)) {
      security.recordAudit('source_probe_blocked', `Blocked access to sensitive path ${req.path}`);
      res.status(403).json({ error: 'Access to source files and server configuration is forbidden.' });
      return;
    }
    next();
  });

  // API firewall: host allowlist, anti-scraper UA check, rate limit, and owner passphrase gate
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') {
      next();
      return;
    }

    const hostHeader = String(req.header('x-forwarded-host') || req.header('host') || '');
    const ua = String(req.header('user-agent') || '');
    const clientKey = getClientKey(req);
    const token = extractSessionToken(req);

    const inspection = security.inspectIncomingRequest({
      hostHeader,
      userAgent: ua,
      clientKey,
      token,
      skipRateLimit: req.path === '/security/status',
    });

    if (!inspection.allowed) {
      res.status(inspection.status).json({ error: inspection.error });
      return;
    }

    const openSecurityPaths = new Set(['/security/status', '/security/unlock', '/security/lock']);
    if (!openSecurityPaths.has(req.path) && !inspection.authenticated) {
      res.status(401).json({
        error: 'This Dialog PMIC Bench instance is locked by its owner.',
        locked: true,
      });
      return;
    }

    next();
  });

  let syncedBenchState: Record<string, unknown> | null = null;
  let autoUpdateState: AutoUpdateScheduleState = {
    enabled12Am: true,
    lastRunDateKey: null,
    lastRunAt: null,
    lastRunSummary: null,
    rateList: createDefaultRateList(),
  };

  // Server-side daily 12:00 AM auto-updater check (runs every 60s, fires cleanly at 00:00 local)
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() <= 2 && shouldRunMidnightUpdate(autoUpdateState, now)) {
      const result = executeRateListUpdateSweep(autoUpdateState.rateList, now);
      autoUpdateState = {
        ...autoUpdateState,
        lastRunDateKey: result.dateKey,
        lastRunAt: result.timestampIso,
        lastRunSummary: `12:00 AM Auto-Run: ${result.summary}`,
        rateList: result.updatedList,
      };
    }
  }, 60_000);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dialog-pmic-bench' });
  });

  app.get('/api/security/status', (req, res) => {
    const token = extractSessionToken(req);
    const status = security.getPublicStatus(token, getClientKey(req));
    res.json({ security: status });
  });

  app.post('/api/security/unlock', (req, res) => {
    const body = req.body as { passphrase?: string };
    const passphrase = typeof body?.passphrase === 'string' ? body.passphrase : '';
    const result = security.unlockWithPassphrase(passphrase, getClientKey(req));
    if (!result.ok || !result.token) {
      res.status(result.lockoutRemainingSec > 0 ? 429 : 401).json({
        ok: false,
        error: result.error ?? 'Unlock failed.',
        lockoutRemainingSec: result.lockoutRemainingSec,
        security: security.getPublicStatus(null, getClientKey(req)),
      });
      return;
    }

    setSessionCookie(res, result.token);
    res.json({
      ok: true,
      token: result.token,
      security: security.getPublicStatus(result.token, getClientKey(req)),
    });
  });

  app.post('/api/security/lock', (_req, res) => {
    clearSessionCookie(res);
    res.json({
      ok: true,
      security: security.getPublicStatus(null, 'local'),
    });
  });

  app.post('/api/security/configure', (req, res) => {
    const body = req.body as ConfigureSecurityInput;
    const outcome = security.configureSecurity(body ?? {});
    if (!outcome.ok) {
      res.status(400).json({ ok: false, error: outcome.error });
      return;
    }
    if (outcome.token) {
      setSessionCookie(res, outcome.token);
    }
    res.json({
      ok: true,
      token: outcome.token,
      security: security.getPublicStatus(outcome.token ?? null, getClientKey(req)),
    });
  });

  app.post('/api/security/revoke-all', (req, res) => {
    security.revokeAllSessions();
    clearSessionCookie(res);
    res.json({
      ok: true,
      security: security.getPublicStatus(null, getClientKey(req)),
    });
  });

  app.get('/api/sync/state', (_req, res) => {
    res.json({ state: syncedBenchState });
  });

  app.post('/api/sync/state', (req, res) => {
    const body = req.body as { state?: Record<string, unknown> | null };
    syncedBenchState = body?.state ?? null;
    res.json({ ok: true, syncedAt: new Date().toISOString() });
  });

  app.get('/api/updates/rate-list', (_req, res) => {
    res.json({ schedule: autoUpdateState });
  });

  app.post('/api/updates/rate-list', (req, res) => {
    const body = req.body as Partial<AutoUpdateScheduleState>;
    autoUpdateState = {
      ...autoUpdateState,
      enabled12Am: typeof body.enabled12Am === 'boolean' ? body.enabled12Am : autoUpdateState.enabled12Am,
      rateList: Array.isArray(body.rateList) ? (body.rateList as RateListEntry[]) : autoUpdateState.rateList,
    };
    res.json({ ok: true, schedule: autoUpdateState });
  });

  app.post('/api/updates/run', (req, res) => {
    const body = req.body as { rateList?: RateListEntry[] };
    const list = Array.isArray(body?.rateList) ? body.rateList : autoUpdateState.rateList;
    const result = executeRateListUpdateSweep(list, new Date());
    autoUpdateState = {
      ...autoUpdateState,
      lastRunDateKey: result.dateKey,
      lastRunAt: result.timestampIso,
      lastRunSummary: result.summary,
      rateList: result.updatedList,
    };
    res.json({ ok: true, schedule: autoUpdateState, result });
  });

  // Auto-discover all manuals for a detected or searched Consumer Device / Gamepad / Dialog PMIC
  app.get('/api/manuals/discover', async (req, res) => {
    const part = String(req.query.part ?? '').trim();
    const docs = matchManualsForPart(part);

    const enriched = await Promise.all(
      docs.map(async (doc, idx) => {
        // Probe official endpoint for the top 2 results to verify live availability without slowing down response
        const sourceStatus: 'verified' | 'local-archive' =
          idx < 2 ? await checkOfficialSourceReachability(doc.officialUrl) : 'local-archive';
        return {
          ...doc,
          sourceStatus,
          downloadUrl: `/api/manuals/download/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}`,
          markdownUrl: `/api/manuals/download/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}&format=md`,
          previewUrl: `/api/manuals/preview/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}`,
        };
      }),
    );

    res.json({
      part: part.toUpperCase() || 'ALL',
      count: enriched.length,
      manuals: enriched,
    });
  });

  // Preview manual details, pinout & registers inline
  app.get('/api/manuals/preview/:docId', (req, res) => {
    const docId = req.params.docId;
    const part = String(req.query.part ?? '');
    const doc = findManualById(docId, part);

    if (!doc) {
      res.status(404).json({ error: 'Manual document not found.' });
      return;
    }

    const profile = ALL_DEVICE_PROFILES[doc.partNumber.toUpperCase()];
    res.json({
      manual: doc,
      profile: profile ?? null,
    });
  });

  // Download manual as real PDF (default), Markdown, or JSON
  app.get('/api/manuals/download/:docId', (req, res) => {
    const docId = req.params.docId;
    const part = String(req.query.part ?? '');
    const format = String(req.query.format ?? 'pdf').toLowerCase();
    const doc = findManualById(docId, part);

    if (!doc) {
      res.status(404).json({ error: 'Manual document not found.' });
      return;
    }

    const profile = ALL_DEVICE_PROFILES[doc.partNumber.toUpperCase()];
    const safeFilenameBase = `${doc.partNumber}_${doc.docType.replace(/\s+/g, '_')}_${doc.revision.replace(/\s+/g, '_')}`;

    if (format === 'json') {
      const payload = JSON.stringify({ manual: doc, profile: profile ?? null }, null, 2);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilenameBase}.json"`);
      res.send(payload);
      return;
    }

    if (format === 'md') {
      const lines = [
        `# ${doc.title}`,
        ``,
        `- **Part Number:** ${doc.partNumber}`,
        `- **Document Type:** ${doc.docType}`,
        `- **Revision:** ${doc.revision} (${doc.releaseDate})`,
        `- **Official Source:** ${doc.officialUrl}`,
        ``,
        `## Summary`,
        doc.summary,
        ``,
        `## Highlights`,
        ...doc.highlights.map((h) => `- ${h}`),
      ];
      if (profile) {
        lines.push('', '## Power Rails', '| Rail | Type | Reg | Range (mV) | Default (mV) | Max I (mA) |');
        lines.push('| --- | --- | --- | --- | --- | --- |');
        for (const r of profile.rails) {
          lines.push(`| ${r.id} | ${r.type} | ${r.regAddr} | ${r.minMv}-${r.maxMv} | ${r.defaultMv} | ${r.maxCurrentMa} |`);
        }
        lines.push('', '## Key I2C Registers', '| Addr | Register | Default | Access | Description |');
        lines.push('| --- | --- | --- | --- | --- |');
        for (const reg of profile.registers) {
          lines.push(`| ${reg.addr} | ${reg.name} | ${reg.defaultVal} | ${reg.access} | ${reg.description} |`);
        }
      }
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilenameBase}.md"`);
      res.send(lines.join('\n'));
      return;
    }

    const statusInfo = security.getPublicStatus(extractSessionToken(req), getClientKey(req));
    const ownerSeal = computeOwnerSealText(statusInfo.ownerLabel, statusInfo.buildFingerprint);
    const pdfBytes = generateManualPdf(doc, profile, ownerSeal);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilenameBase}.pdf"`);
    res.setHeader('Content-Length', String(pdfBytes.length));
    res.send(Buffer.from(pdfBytes));
  });

  // Firmware / OTP catalog for reflashing
  app.get('/api/firmware/catalog', (req, res) => {
    const part = String(req.query.part ?? '').trim();
    const packages = part ? matchFirmwareForPart(part) : FIRMWARE_CATALOG;
    res.json({
      part: part.toUpperCase() || 'ALL',
      packages,
    });
  });

  // Download stock firmware / OTP image as Intel HEX or raw binary
  app.get('/api/firmware/download/:fwId', (req, res) => {
    const fw = FIRMWARE_CATALOG.find((f) => f.id === req.params.fwId);
    if (!fw) {
      res.status(404).json({ error: 'Firmware package not found.' });
      return;
    }

    const format = String(req.query.format ?? 'hex').toLowerCase();
    const safeName = `${fw.partNumber}_${fw.version.replace(/[^A-Za-z0-9._-]/g, '_')}`;

    if (format === 'bin') {
      const buf = Buffer.alloc(fw.sizeBytes, 0xff);
      fw.patchRegisters.forEach((p, idx) => {
        const val = parseInt(p.value, 16);
        if (!Number.isNaN(val) && idx < buf.length) {
          buf[idx] = val & 0xff;
        }
      });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.bin"`);
      res.send(buf);
      return;
    }

    // Generate clean Intel HEX file containing the patch registers
    const hexLines: string[] = [];
    for (const p of fw.patchRegisters) {
      const addr = parseInt(p.addr, 16) & 0xffff;
      const val = parseInt(p.value, 16) & 0xff;
      const hi = (addr >> 8) & 0xff;
      const lo = addr & 0xff;
      const sum = (0x01 + hi + lo + 0x00 + val) & 0xff;
      const cksum = ((~sum + 1) & 0xff).toString(16).toUpperCase().padStart(2, '0');
      const addrHex = addr.toString(16).toUpperCase().padStart(4, '0');
      const valHex = val.toString(16).toUpperCase().padStart(2, '0');
      hexLines.push(`:01${addrHex}00${valHex}${cksum}`);
    }
    hexLines.push(':00000001FF');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.hex"`);
    res.send(hexLines.join('\n') + '\n');
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(503).send('Production bundle not built yet. Run "npm run build" first.');
        return;
      }
      res.sendFile(indexHtmlPath);
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Dialog PMIC Bench server listening on http://localhost:${PORT}`);
  });
}

startServer();
