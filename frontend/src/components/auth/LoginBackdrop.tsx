import { BugJourney, type JourneyStation } from './BugJourney';

const PATH =
  'M -60 640 C 40 640, 120 600, 120 560 C 120 400, 60 120, 300 60 S 700 40, 850 170 C 950 260, 760 440, 850 560 S 1200 720, 1480 620 C 1620 570, 1560 400, 1500 262';
const STATIONS: JourneyStation[] = [
  { x: 120, y: 560, label: 'Filed', tone: '#64748b' },
  { x: 850, y: 170, label: 'Confirmed', tone: '#d97706' },
  { x: 850, y: 560, label: 'In progress', tone: '#0284c7' },
  { x: 1480, y: 620, label: 'Fixed', tone: '#2563eb' },
  { x: 1500, y: 262, label: 'Verified', tone: '#059669' },
];

/** The sign-in page's background: the life of a bug, drawn as weather. */
export function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#EEF4FF_0%,#F8FAFE_55%,#FFFFFF_100%)]" />
      <div className="absolute -left-48 -top-48 h-[48rem] w-[48rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.20)_0%,transparent_62%)] blur-2xl animate-blob-slow motion-reduce:animate-none" />
      <div className="absolute -bottom-56 -right-40 h-[50rem] w-[50rem] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.18)_0%,transparent_62%)] blur-2xl animate-blob motion-reduce:animate-none" />
      <div className="absolute left-[45%] top-[30%] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.14)_0%,transparent_62%)] blur-2xl animate-blob-slow motion-reduce:animate-none" />
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(37,99,235,0.28)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)]" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="lb-path" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#94a3b8" />
            <stop offset="0.5" stopColor="#2563eb" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path d={PATH} fill="none" stroke="url(#lb-path)" strokeWidth="26" strokeOpacity="0.07" strokeLinecap="round" />
        <path
          d={PATH}
          fill="none"
          stroke="url(#lb-path)"
          strokeWidth="2"
          strokeOpacity="0.45"
          strokeLinecap="round"
          strokeDasharray="10 14"
        />
        {STATIONS.map((station) => (
          <g key={station.label} transform={`translate(${station.x} ${station.y})`}>
            <circle r="30" fill={station.tone} fillOpacity="0.06" />
            <circle r="14" fill="#ffffff" fillOpacity="0.9" stroke={station.tone} strokeOpacity="0.5" strokeWidth="2" />
            <circle r="5" fill={station.tone} fillOpacity="0.85" />
            <text
              y="52"
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill={station.tone}
              fillOpacity="0.7"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.08em"
            >
              {station.label.toUpperCase()}
            </text>
          </g>
        ))}
        <BugJourney path={PATH} stations={STATIONS} />
      </svg>

      {TICKETS.map((ticket, i) => (
        <div
          key={i}
          className={`absolute rounded-2xl border border-white/80 bg-white/55 shadow-[0_18px_40px_-18px_rgba(37,99,235,0.35)] backdrop-blur-sm ${ticket.motion} motion-reduce:animate-none`}
          style={{
            left: ticket.x,
            top: ticket.y,
            width: ticket.w,
            transform: `rotate(${ticket.rot}deg)`,
            opacity: ticket.o,
          }}
        >
          <div className="h-1.5 w-full rounded-t-2xl" style={{ background: ticket.bar }} />
          <div className="p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-12 rounded-full bg-slate-300/80" />
              <span className="h-2 w-6 rounded-full bg-slate-200" />
            </div>
            <div className="mt-2.5 h-2.5 w-[82%] rounded-full bg-slate-300/80" />
            <div className="mt-1.5 h-2.5 w-[60%] rounded-full bg-slate-200" />
            <div className="mt-3 flex gap-1.5">
              <span className="h-4 w-14 rounded-full" style={{ background: ticket.pill, opacity: 0.55 }} />
              <span className="h-4 w-10 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const TICKETS = [
  { x: '2%', y: '38%', w: 150, rot: -7, o: 0.75, bar: '#f59e0b', pill: '#fde68a', motion: 'animate-float-slow' },
  { x: '63%', y: '3%', w: 128, rot: 5, o: 0.55, bar: '#0ea5e9', pill: '#bae6fd', motion: 'animate-float' },
  { x: '56%', y: '80%', w: 156, rot: 3, o: 0.7, bar: '#10b981', pill: '#a7f3d0', motion: 'animate-float' },
  { x: '79%', y: '8%', w: 140, rot: -4, o: 0.6, bar: '#f43f5e', pill: '#fecdd3', motion: 'animate-float-slow' },
  { x: '89%', y: '80%', w: 132, rot: 6, o: 0.65, bar: '#2563eb', pill: '#bfdbfe', motion: 'animate-float' },
  { x: '8%', y: '78%', w: 136, rot: 4, o: 0.6, bar: '#6366f1', pill: '#c7d2fe', motion: 'animate-float-slow' },
];
