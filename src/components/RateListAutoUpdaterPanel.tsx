import { useState } from 'react';
import { CalendarClock, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  formatCountdownToMidnight,
  type AutoUpdateScheduleState,
  type RateListEntry,
} from '../utils/rateListUpdater';

interface RateListAutoUpdaterPanelProps {
  scheduleState: AutoUpdateScheduleState;
  runningUpdate: boolean;
  onToggleEnabled12Am: () => void;
  onUpdateRateList: (nextList: RateListEntry[]) => void;
  onRunUpdateNow: () => Promise<void>;
}

const POLLING_OPTIONS: Array<125 | 250 | 500 | 1000> = [125, 250, 500, 1000];

export function RateListAutoUpdaterPanel({
  scheduleState,
  runningUpdate,
  onToggleEnabled12Am,
  onUpdateRateList,
  onRunUpdateNow,
}: RateListAutoUpdaterPanelProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newPart, setNewPart] = useState('DUALSENSE');
  const [newRateHz, setNewRateHz] = useState<125 | 250 | 500 | 1000>(500);
  const [newDeadzonePct, setNewDeadzonePct] = useState(6);

  const countdown = formatCountdownToMidnight();

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = newLabel.trim();
    const cleanPart = newPart.trim().toUpperCase();
    if (!cleanLabel || !cleanPart) return;

    const entry: RateListEntry = {
      id: `rate-${Date.now()}`,
      label: cleanLabel,
      partNumber: cleanPart,
      pollingRateHz: newRateHz,
      deadzonePct: Math.max(0, Math.min(25, newDeadzonePct)),
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: null,
      status: 'pending',
    };
    onUpdateRateList([entry, ...scheduleState.rateList]);
    setNewLabel('');
  };

  return (
    <div className="space-y-6">
      {/* Schedule Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Schedule: Daily at 12:00 AM Local · Next run in <span className="font-mono tabular-nums font-medium">{countdown}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Daily 12:00 AM Auto-Updater &amp; Rate List</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Automatically connects at 12:00 AM every day to fetch firmware updates, manuals, polling rates, and deadzone targets for all active items in your Rate List.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={scheduleState.enabled12Am}
              aria-label="Enable daily 12:00 AM auto-updates"
              onClick={onToggleEnabled12Am}
              className={`min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-2 ${
                scheduleState.enabled12Am
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>{scheduleState.enabled12Am ? '12:00 AM Auto-Run: ON' : '12:00 AM Auto-Run: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => void onRunUpdateNow()}
              disabled={runningUpdate}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${runningUpdate ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{runningUpdate ? 'Running Updates...' : 'Run Update Now'}</span>
            </button>
          </div>
        </div>

        {scheduleState.lastRunSummary && (
          <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{scheduleState.lastRunSummary}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Editable Rate List Table */}
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Configured Rate List ({scheduleState.rateList.filter((r) => r.enabled).length} Active)
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Synced across app &amp; 12:00 AM runner
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {scheduleState.rateList.map((item) => (
              <div
                key={item.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.label}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {item.partNumber}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {item.lastFirmwareVersion ? `Target FW: ${item.lastFirmwareVersion}` : 'Pending check'} ·{' '}
                    {item.status === 'updated' && item.lastUpdatedAt
                      ? `Updated ${new Date(item.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : item.status === 'skipped'
                        ? 'Paused'
                        : 'Queued for 12:00 AM'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="sr-only" htmlFor={`rate-hz-${item.id}`}>
                    Polling rate for {item.label}
                  </label>
                  <select
                    id={`rate-hz-${item.id}`}
                    value={item.pollingRateHz}
                    onChange={(e) => {
                      const val = Number(e.target.value) as 125 | 250 | 500 | 1000;
                      onUpdateRateList(
                        scheduleState.rateList.map((r) =>
                          r.id === item.id ? { ...r, pollingRateHz: val } : r,
                        ),
                      );
                    }}
                    className="min-h-[36px] px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {POLLING_OPTIONS.map((hz) => (
                      <option key={hz} value={hz}>
                        {hz} Hz
                      </option>
                    ))}
                  </select>

                  <label className="sr-only" htmlFor={`rate-dz-${item.id}`}>
                    Deadzone percentage for {item.label}
                  </label>
                  <select
                    id={`rate-dz-${item.id}`}
                    value={item.deadzonePct}
                    onChange={(e) => {
                      const dz = Number(e.target.value);
                      onUpdateRateList(
                        scheduleState.rateList.map((r) =>
                          r.id === item.id ? { ...r, deadzonePct: dz } : r,
                        ),
                      );
                    }}
                    className="min-h-[36px] px-2.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {[0, 3, 5, 6, 8, 10, 12, 15].map((dz) => (
                      <option key={dz} value={dz}>
                        DZ {dz}%
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRateList(
                        scheduleState.rateList.map((r) =>
                          r.id === item.id ? { ...r, enabled: !r.enabled } : r,
                        ),
                      )
                    }
                    className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      item.enabled
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.enabled ? 'Active' : 'Paused'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRateList(scheduleState.rateList.filter((r) => r.id !== item.id))
                    }
                    aria-label={`Remove ${item.label} from rate list`}
                    className="min-h-[36px] min-w-[36px] p-1.5 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Custom Rate List Item */}
        <form
          onSubmit={handleAddEntry}
          className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Add Target to Rate List
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label htmlFor="new-rate-label" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Device / Profile Name
              </label>
              <input
                id="new-rate-label"
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Tournament Xbox 360 Wired"
                className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="new-rate-part" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Part Code
              </label>
              <select
                id="new-rate-part"
                value={newPart}
                onChange={(e) => setNewPart(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
              >
                <option value="DUALSENSE">DUALSENSE (PS5)</option>
                <option value="DUALSHOCK4">DUALSHOCK4 (PS4)</option>
                <option value="PS3-SIXAXIS">PS3-SIXAXIS (PS3)</option>
                <option value="XBOX-CTRL">XBOX-CTRL (Xbox Series/One)</option>
                <option value="XBOX-360">XBOX-360 (Xbox 360)</option>
                <option value="SWITCH-PRO">SWITCH-PRO (Switch Pro/Joy-Con)</option>
                <option value="NINTENDO-RETRO">NINTENDO-RETRO (NES/SNES/N64/GC)</option>
                <option value="8BITDO-PAD">8BITDO-PAD (8BitDo / TMR)</option>
                <option value="LOGITECH-PAD">LOGITECH-PAD (F310/F710)</option>
                <option value="GALAXY-USBC">GALAXY-USBC (Galaxy PD)</option>
                <option value="IPHONE-USBC">IPHONE-USBC (iPhone/iPad)</option>
                <option value="GAN-PD-100W">GAN-PD-100W (GaN Charger)</option>
                <option value="NVME-USBC">NVME-USBC (NVMe SSD)</option>
                <option value="DA9063">DA9063 (Dialog PMIC)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-rate-hz" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Rate
                </label>
                <select
                  id="new-rate-hz"
                  value={newRateHz}
                  onChange={(e) => setNewRateHz(Number(e.target.value) as 125 | 250 | 500 | 1000)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                >
                  {POLLING_OPTIONS.map((hz) => (
                    <option key={hz} value={hz}>
                      {hz} Hz
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-rate-dz" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Deadzone (%)
                </label>
                <input
                  id="new-rate-dz"
                  type="number"
                  min={0}
                  max={25}
                  value={newDeadzonePct}
                  onChange={(e) => setNewDeadzonePct(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add to Rate List</span>
          </button>
        </form>
      </div>
    </div>
  );
}
