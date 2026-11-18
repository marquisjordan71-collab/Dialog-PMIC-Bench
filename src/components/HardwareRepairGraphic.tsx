import type { HardwareGraphicKind, HardwareRepairStep } from '../utils/pmicDiagnostics';

interface HardwareRepairGraphicProps {
  kind: HardwareGraphicKind;
  activeStep: HardwareRepairStep;
  partNumber: string;
}

export function HardwareRepairGraphic({ kind, activeStep, partNumber }: HardwareRepairGraphicProps) {
  const zone = activeStep.highlightZone;
  const isProbe = zone === 'probe';
  const isRework = zone === 'rework';
  const isPowerOff = zone === 'power-off';
  const isVerify = zone === 'verify';

  return (
    <figure className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono font-semibold text-slate-200">
          Step {activeStep.stepNumber} Diagram · {partNumber} Hardware View
        </span>
        <span className="font-mono text-cyan-300">
          {isPowerOff && 'USB-C OTG Unplugged (Safe Mode)'}
          {isProbe && 'Multimeter Probe Points'}
          {isRework && 'SMD Rework Target Zone'}
          {isVerify && 'Powered Verification Target'}
        </span>
      </div>

      {kind === 'i2c-pullup' && (
        <svg
          viewBox="0 0 560 220"
          role="img"
          aria-label="I2C SDA and SCL pull-up resistor repair schematic"
          className="w-full h-auto rounded-lg bg-slate-900 border border-slate-800"
        >
          {/* VIO Rail */}
          <line x1="80" y1="36" x2="460" y2="36" stroke="#38BDF8" strokeWidth="2.5" />
          <text x="90" y="26" fill="#38BDF8" fontSize="11" fontFamily="monospace">
            VIO PULL-UP RAIL (1.8V / 3.3V)
          </text>

          {/* Jumper J2 */}
          <rect
            x="110"
            y="48"
            width="64"
            height="32"
            rx="4"
            fill={isProbe ? '#1E3A8A' : '#1E293B'}
            stroke={isProbe ? '#60A5FA' : '#475569'}
            strokeWidth="2"
          />
          <text x="142" y="68" textAnchor="middle" fill="#E2E8F0" fontSize="11" fontFamily="monospace">
            J2 VIO
          </text>
          <line x1="142" y1="36" x2="142" y2="48" stroke="#38BDF8" strokeWidth="2" />

          {/* R12 SDA Pull-up */}
          <line x1="250" y1="36" x2="250" y2="66" stroke="#94A3B8" strokeWidth="2" />
          <rect
            x="232"
            y="66"
            width="36"
            height="46"
            rx="4"
            fill={isRework ? '#7C2D12' : '#1E293B'}
            stroke={isRework ? '#F97316' : '#64748B'}
            strokeWidth="2.5"
          />
          <text x="250" y="88" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            R12
          </text>
          <text x="250" y="102" textAnchor="middle" fill="#FDBA74" fontSize="9" fontFamily="monospace">
            2.2kΩ
          </text>
          <line x1="250" y1="112" x2="250" y2="142" stroke="#94A3B8" strokeWidth="2" />

          {/* R13 SCL Pull-up */}
          <line x1="350" y1="36" x2="350" y2="66" stroke="#94A3B8" strokeWidth="2" />
          <rect
            x="332"
            y="66"
            width="36"
            height="46"
            rx="4"
            fill={isRework ? '#7C2D12' : '#1E293B'}
            stroke={isRework ? '#F97316' : '#64748B'}
            strokeWidth="2.5"
          />
          <text x="350" y="88" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            R13
          </text>
          <text x="350" y="102" textAnchor="middle" fill="#FDBA74" fontSize="9" fontFamily="monospace">
            2.2kΩ
          </text>
          <line x1="350" y1="112" x2="350" y2="174" stroke="#94A3B8" strokeWidth="2" />

          {/* PMIC IC */}
          <rect x="390" y="124" width="130" height="72" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="2" />
          <text x="455" y="155" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="bold" fontFamily="monospace">
            {partNumber}
          </text>
          <text x="455" y="173" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
            SDA / SCL Pins
          </text>

          {/* SDA & SCL Bus Lines */}
          <line x1="80" y1="142" x2="390" y2="142" stroke={isVerify ? '#34D399' : '#CBD5E1'} strokeWidth="2.5" />
          <text x="86" y="135" fill="#E2E8F0" fontSize="10" fontFamily="monospace">
            TP_SDA
          </text>
          <line x1="80" y1="174" x2="390" y2="174" stroke={isVerify ? '#34D399' : '#CBD5E1'} strokeWidth="2.5" />
          <text x="86" y="167" fill="#E2E8F0" fontSize="10" fontFamily="monospace">
            TP_SCL
          </text>

          {/* Probe markers */}
          <circle cx="190" cy="142" r="6" fill={isProbe || isPowerOff ? '#EF4444' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="190" cy="174" r="6" fill={isProbe || isPowerOff ? '#F59E0B' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          {(isProbe || isPowerOff) && (
            <text x="190" y="204" textAnchor="middle" fill="#FCA5A5" fontSize="10" fontFamily="monospace">
              PROBE HERE: 2.0k–4.7kΩ to VIO
            </text>
          )}
          {isRework && (
            <text x="300" y="204" textAnchor="middle" fill="#FDBA74" fontSize="10" fontFamily="monospace">
              REFLOW 0603 2.2kΩ RESISTORS R12 &amp; R13
            </text>
          )}
          {isVerify && (
            <text x="290" y="204" textAnchor="middle" fill="#6EE7B7" fontSize="10" fontFamily="monospace">
              IDLE SDA &amp; SCL = VIO (1.8V / 3.3V)
            </text>
          )}
        </svg>
      )}

      {kind === 'buck-inductor' && (
        <svg
          viewBox="0 0 560 220"
          role="img"
          aria-label="Buck switching node inductor and output capacitor repair schematic"
          className="w-full h-auto rounded-lg bg-slate-900 border border-slate-800"
        >
          {/* PMIC SW Pin */}
          <rect x="34" y="64" width="124" height="88" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="2" />
          <text x="96" y="102" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="bold" fontFamily="monospace">
            {partNumber}
          </text>
          <text x="96" y="122" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
            SW / LX Node
          </text>

          {/* SW trace to L1 */}
          <line x1="158" y1="100" x2="218" y2="100" stroke="#FBBF24" strokeWidth="3" />
          <text x="188" y="90" textAnchor="middle" fill="#FBBF24" fontSize="10" fontFamily="monospace">
            SW
          </text>

          {/* Power Inductor L1 */}
          <rect
            x="218"
            y="74"
            width="92"
            height="52"
            rx="6"
            fill={isRework || isPowerOff ? '#7C2D12' : '#1E293B'}
            stroke={isRework || isPowerOff ? '#F97316' : '#64748B'}
            strokeWidth="2.5"
          />
          <text x="264" y="97" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="bold" fontFamily="monospace">
            L1 (4x4mm)
          </text>
          <text x="264" y="113" textAnchor="middle" fill="#FDBA74" fontSize="10" fontFamily="monospace">
            1.0 µH / 4.5A
          </text>

          {/* VOUT rail */}
          <line x1="310" y1="100" x2="490" y2="100" stroke={isVerify ? '#34D399' : '#38BDF8'} strokeWidth="3" />
          <text x="456" y="90" textAnchor="middle" fill="#38BDF8" fontSize="10" fontFamily="monospace">
            VOUT (TP5)
          </text>

          {/* Output Cap C_OUT */}
          <line x1="380" y1="100" x2="380" y2="124" stroke="#94A3B8" strokeWidth="2" />
          <rect
            x="356"
            y="124"
            width="48"
            height="34"
            rx="4"
            fill={isProbe ? '#1E3A8A' : '#1E293B'}
            stroke={isProbe ? '#60A5FA' : '#64748B'}
            strokeWidth="2"
          />
          <text x="380" y="145" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            COUT 22µF
          </text>
          <line x1="380" y1="158" x2="380" y2="180" stroke="#94A3B8" strokeWidth="2" />
          <line x1="364" y1="180" x2="396" y2="180" stroke="#94A3B8" strokeWidth="2.5" />
          <text x="380" y="195" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
            GND
          </text>

          {/* TP5 Probe circle */}
          <circle cx="456" cy="100" r="7" fill={isProbe || isVerify ? '#EF4444' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          {isProbe && (
            <text x="235" y="198" textAnchor="middle" fill="#93C5FD" fontSize="10" fontFamily="monospace">
              OHM CHECK TP5-to-GND: &gt; 50 Ω (NO SHORT)
            </text>
          )}
          {isPowerOff && (
            <text x="235" y="198" textAnchor="middle" fill="#FDBA74" fontSize="10" fontFamily="monospace">
              MASK AROUND L1 WITH KAPTON · CHECK DCR &lt; 0.08 Ω
            </text>
          )}
          {isRework && (
            <text x="235" y="198" textAnchor="middle" fill="#FDBA74" fontSize="10" fontFamily="monospace">
              HOT-AIR 360°C REPLACE L1 · WICK PADS FLAT
            </text>
          )}
          {isVerify && (
            <text x="235" y="198" textAnchor="middle" fill="#6EE7B7" fontSize="10" fontFamily="monospace">
              VERIFY NOMINAL VOUT &amp; RIPPLE &lt; 25 mVpp
            </text>
          )}
        </svg>
      )}

      {kind === 'vbus-usb-otg' && (
        <svg
          viewBox="0 0 560 220"
          role="img"
          aria-label="USB-C OTG VBUS to VSYS power path repair diagram"
          className="w-full h-auto rounded-lg bg-slate-900 border border-slate-800"
        >
          <rect
            x="30"
            y="70"
            width="102"
            height="64"
            rx="6"
            fill={isPowerOff ? '#1E3A8A' : '#1E293B'}
            stroke={isPowerOff ? '#60A5FA' : '#64748B'}
            strokeWidth="2"
          />
          <text x="81" y="98" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="bold" fontFamily="monospace">
            USB-C OTG
          </text>
          <text x="81" y="116" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
            VBUS 5.0V
          </text>

          <line x1="132" y1="102" x2="188" y2="102" stroke="#38BDF8" strokeWidth="2.5" />

          {/* Jumper J1 / Schottky */}
          <rect
            x="188"
            y="78"
            width="86"
            height="48"
            rx="5"
            fill={isPowerOff ? '#7C2D12' : '#1E293B'}
            stroke={isPowerOff ? '#F97316' : '#64748B'}
            strokeWidth="2"
          />
          <text x="231" y="99" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            J1 / D1
          </text>
          <text x="231" y="114" textAnchor="middle" fill="#CBD5E1" fontSize="9" fontFamily="monospace">
            Schottky
          </text>

          <line x1="274" y1="102" x2="404" y2="102" stroke={isVerify ? '#34D399' : '#38BDF8'} strokeWidth="3" />
          <text x="338" y="90" textAnchor="middle" fill="#38BDF8" fontSize="10" fontFamily="monospace">
            VSYS (TP1)
          </text>

          {/* Bulk Cap C_IN */}
          <line x1="338" y1="102" x2="338" y2="128" stroke="#94A3B8" strokeWidth="2" />
          <rect
            x="312"
            y="128"
            width="52"
            height="34"
            rx="4"
            fill={isRework ? '#7C2D12' : '#1E293B'}
            stroke={isRework ? '#F97316' : '#64748B'}
            strokeWidth="2"
          />
          <text x="338" y="149" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            CIN 22µF
          </text>
          <line x1="338" y1="162" x2="338" y2="180" stroke="#94A3B8" strokeWidth="2" />
          <line x1="322" y1="180" x2="354" y2="180" stroke="#94A3B8" strokeWidth="2.5" />

          {/* PMIC */}
          <rect x="404" y="64" width="124" height="78" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="2" />
          <text x="466" y="100" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="bold" fontFamily="monospace">
            {partNumber}
          </text>
          <text x="466" y="118" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="monospace">
            Pin A1/B1 VSYS
          </text>

          <circle cx="338" cy="102" r="7" fill={isProbe ? '#EF4444' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          <text x="270" y="202" textAnchor="middle" fill="#E2E8F0" fontSize="10" fontFamily="monospace">
            {isProbe && 'MEASURE TP1 (VSYS) vs USB-C VBUS: DROP < 0.25V'}
            {isPowerOff && 'SWAP TO 5A USB-C OTG CABLE · CHECK J1 < 0.15 Ω'}
            {isRework && 'REFLOW OR REPLACE 0805 22µF INPUT CAPACITOR CIN'}
            {isVerify && 'CONFIRM VSYS 4.85V – 5.10V UNDER BUCK LOAD'}
          </text>
        </svg>
      )}

      {kind === 'thermal-qfn' && (
        <svg
          viewBox="0 0 560 220"
          role="img"
          aria-label="QFN exposed thermal pad and PCB thermal via array repair cross-section"
          className="w-full h-auto rounded-lg bg-slate-900 border border-slate-800"
        >
          {/* Optional top heatsink */}
          <rect
            x="200"
            y="28"
            width="160"
            height="28"
            rx="3"
            fill={isRework || isVerify ? '#0E7490' : '#1E293B'}
            stroke={isRework || isVerify ? '#22D3EE' : '#475569'}
            strokeWidth="2"
          />
          <text x="280" y="46" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="monospace">
            9x9mm THERMAL SHIM / HEATSINK
          </text>

          {/* QFN Package */}
          <rect x="190" y="64" width="180" height="46" rx="4" fill="#0F172A" stroke="#64748B" strokeWidth="2" />
          <text x="280" y="92" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="bold" fontFamily="monospace">
            {partNumber} QFN / WLCSP
          </text>

          {/* Exposed Pad EPAD */}
          <rect
            x="225"
            y="110"
            width="110"
            height="14"
            fill={isRework ? '#F97316' : '#FBBF24'}
            stroke="#FFFFFF"
            strokeWidth="1"
          />
          <text x="415" y="121" fill="#FDE68A" fontSize="10" fontFamily="monospace">
            EPAD (GND)
          </text>

          {/* PCB Substrate & Thermal Vias */}
          <rect x="100" y="124" width="360" height="44" fill="#1E293B" stroke="#475569" strokeWidth="2" />
          {[240, 265, 290, 315].map((vx) => (
            <line
              key={vx}
              x1={vx}
              y1="124"
              x2={vx}
              y2="168"
              stroke={isPowerOff || isRework ? '#F59E0B' : '#94A3B8'}
              strokeWidth="4"
            />
          ))}
          <rect x="100" y="168" width="360" height="10" fill="#38BDF8" />
          <text x="280" y="198" textAnchor="middle" fill="#BAE6FD" fontSize="10" fontFamily="monospace">
            {isProbe && 'IR PROBE PACKAGE TOP: TARGET ΔT < 20°C ABOVE AMBIENT'}
            {isPowerOff && 'VERIFY EPAD-TO-GND VIA CONTINUITY < 0.05 Ω'}
            {isRework && 'REFLOW EPAD AT 245°C + MOUNT THERMAL PAD'}
            {isVerify && 'CONFIRM STEADY DIE TEMP ≤ 55°C'}
          </text>
        </svg>
      )}

      {kind === 'usbc-port' && (
        <svg
          viewBox="0 0 560 220"
          role="img"
          aria-label="USB-C port, CC1/CC2 pull-down, ESD TVS diode array, and controller IC repair schematic"
          className="w-full h-auto rounded-lg bg-slate-900 border border-slate-800"
        >
          {/* USB Receptacle */}
          <rect
            x="26"
            y="52"
            width="104"
            height="104"
            rx="6"
            fill={isPowerOff || isRework ? '#7C2D12' : '#1E293B'}
            stroke={isPowerOff || isRework ? '#F97316' : '#64748B'}
            strokeWidth="2.5"
          />
          <text x="78" y="84" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="bold" fontFamily="monospace">
            USB PORT
          </text>
          <text x="78" y="102" textAnchor="middle" fill="#CBD5E1" fontSize="9.5" fontFamily="monospace">
            24-Pin / Micro
          </text>
          <text x="78" y="120" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">
            Anchor Legs
          </text>

          {/* VBUS, CC1/CC2, D+/D- traces */}
          <line x1="130" y1="72" x2="402" y2="72" stroke={isVerify ? '#34D399' : '#38BDF8'} strokeWidth="2.5" />
          <text x="200" y="63" fill="#38BDF8" fontSize="9.5" fontFamily="monospace">
            VBUS (TP_VBUS)
          </text>

          <line x1="130" y1="104" x2="402" y2="104" stroke="#CBD5E1" strokeWidth="2" />
          <text x="195" y="96" fill="#E2E8F0" fontSize="9.5" fontFamily="monospace">
            D+ / D-
          </text>

          <line x1="130" y1="136" x2="402" y2="136" stroke="#FBBF24" strokeWidth="2" />
          <text x="192" y="128" fill="#FDE68A" fontSize="9.5" fontFamily="monospace">
            CC1 / CC2
          </text>

          {/* USBLC6 ESD Diode Array */}
          <rect
            x="248"
            y="88"
            width="86"
            height="34"
            rx="4"
            fill={isProbe || isRework ? '#1E3A8A' : '#1E293B'}
            stroke={isProbe || isRework ? '#60A5FA' : '#64748B'}
            strokeWidth="2"
          />
          <text x="291" y="103" textAnchor="middle" fill="#F8FAFC" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
            USBLC6 ESD
          </text>
          <text x="291" y="116" textAnchor="middle" fill="#93C5FD" fontSize="8.5" fontFamily="monospace">
            TVS Array
          </text>

          {/* 5.1k CC Pulldowns */}
          <line x1="291" y1="136" x2="291" y2="152" stroke="#FBBF24" strokeWidth="2" />
          <rect x="262" y="152" width="58" height="22" rx="3" fill="#0F172A" stroke="#64748B" strokeWidth="1.5" />
          <text x="291" y="167" textAnchor="middle" fill="#FDE68A" fontSize="9" fontFamily="monospace">
            5.1kΩ GND
          </text>

          {/* Controller / PD IC */}
          <rect x="402" y="54" width="132" height="102" rx="6" fill="#0F172A" stroke="#475569" strokeWidth="2" />
          <text x="468" y="92" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="bold" fontFamily="monospace">
            {partNumber}
          </text>
          <text x="468" y="110" textAnchor="middle" fill="#94A3B8" fontSize="9.5" fontFamily="monospace">
            PD / HID / PMIC
          </text>
          <text x="468" y="128" textAnchor="middle" fill="#6EE7B7" fontSize="9" fontFamily="monospace">
            LDO 3.3V TP
          </text>

          {/* Diode Probe Circles */}
          <circle cx="170" cy="72" r="5" fill={isProbe ? '#EF4444' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="170" cy="104" r="5" fill={isProbe ? '#F59E0B' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx="170" cy="136" r="5" fill={isProbe ? '#38BDF8' : '#334155'} stroke="#FFFFFF" strokeWidth="1.5" />

          <text x="280" y="200" textAnchor="middle" fill="#E2E8F0" fontSize="10" fontFamily="monospace">
            {isPowerOff && 'UNPLUG BATTERY & INSPECT PORT TONGUE / ANCHOR LEGS'}
            {isProbe && 'DIODE MODE: D+/D- 0.45–0.70V · CC1/CC2 0.42–0.68V (NO SHORT)'}
            {isRework && 'KAPTON MASK PLASTIC · REFLOW ESD ARRAY OR USB RECEPTACLE'}
            {isVerify && 'TEST BOTH 0° & 180° CABLE ORIENTATIONS FOR CLEAN ENUMERATION'}
          </text>
        </svg>
      )}

      <figcaption className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-1">
        <span>Target Reading: <span className="font-mono text-emerald-300">{activeStep.expectedReading}</span></span>
      </figcaption>
    </figure>
  );
}
