import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';

/** One bug's life, acted out on the sign-in backdrop's lifecycle line. */
export interface JourneyStation {
  x: number;
  y: number;
  label: string;
  tone: string;
}

const SPEED = 240;
const FIRST_ID = 2417;

const LOOKS = [
  { chip: 'New bug', tone: '#e11d48' },
  { chip: 'Confirmed', tone: '#d97706' },
  { chip: 'In progress', tone: '#0284c7' },
  { chip: 'Fixed', tone: '#16a34a' },
  { chip: 'Verified', tone: '#059669' },
];

type Phase = {
  kind: 'spawn' | 'hold' | 'move' | 'fade' | 'rest';
  dur: number;
  from: number;
  to: number;
  stage: number;
};

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function BugJourney({ path, stations }: { path: string; stations: JourneyStation[] }) {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const moverRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const [stage, setStage] = useState(-1);
  const [cycle, setCycle] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const element = pathRef.current;
    if (!element) return;
    const total = element.getTotalLength();

    const at = stations.map((station) => {
      let best = 0;
      let bestD = Infinity;
      for (let position = 0; position <= total; position += total / 2400) {
        const domPoint = element.getPointAtLength(position);
        const distanceSquared = (domPoint.x - station.x) ** 2 + (domPoint.y - station.y) ** 2;
        if (distanceSquared < bestD) [bestD, best] = [distanceSquared, position];
      }
      return best;
    });

    const last = at[at.length - 1];
    const phases: Phase[] = [
      { kind: 'spawn', dur: 0.7, from: at[0], to: at[0], stage: 0 },
      { kind: 'hold', dur: 1.3, from: at[0], to: at[0], stage: 0 },
    ];
    for (let i = 1; i < at.length; i++) {
      phases.push({ kind: 'move', dur: (at[i] - at[i - 1]) / SPEED, from: at[i - 1], to: at[i], stage: i - 1 });
      phases.push({ kind: 'hold', dur: i === at.length - 1 ? 2.6 : 1.4, from: at[i], to: at[i], stage: i });
    }
    phases.push({ kind: 'fade', dur: 0.9, from: last, to: last, stage: at.length - 1 });
    phases.push({ kind: 'rest', dur: 1.4, from: at[0], to: at[0], stage: -1 });

    let round = 0;
    const enter = (i: number) => {
      const phase = phases[i];
      setStage(phase.stage);
      setMoving(phase.kind === 'move');
      if (i === 0) setCycle(round++);
    };

    let index = 0;
    let elapsed = 0;
    let previous = performance.now();
    let heading = 0;
    let animationFrame = 0;
    enter(0);

    const frame = (now: number) => {
      const deltaSeconds = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      elapsed += deltaSeconds;
      while (elapsed >= phases[index].dur) {
        elapsed -= phases[index].dur;
        index = (index + 1) % phases.length;
        enter(index);
      }
      const phase = phases[index];
      const progress = phase.dur ? elapsed / phase.dur : 1;
      const pathLength = phase.kind === 'move' ? phase.from + (phase.to - phase.from) * easeInOut(progress) : phase.to;

      const domPoint = element.getPointAtLength(pathLength);
      const ahead = element.getPointAtLength(Math.min(total, pathLength + 3));
      const behind = element.getPointAtLength(Math.max(0, pathLength - 3));
      const target = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
      heading += (((((target - heading + 540) % 360) + 360) % 360) - 180) * Math.min(1, deltaSeconds * 10);

      const opacity =
        phase.kind === 'spawn' ? progress : phase.kind === 'fade' ? 1 - progress : phase.kind === 'rest' ? 0 : 1;
      moverRef.current?.setAttribute('transform', `translate(${domPoint.x.toFixed(1)} ${domPoint.y.toFixed(1)})`);
      moverRef.current?.setAttribute('opacity', opacity.toFixed(2));
      bodyRef.current?.setAttribute('transform', `rotate(${heading.toFixed(1)})`);

      const trail = trailRef.current;
      if (trail) {
        trail.setAttribute(
          'stroke-dasharray',
          `0 ${at[0].toFixed(1)} ${Math.max(0, pathLength - at[0]).toFixed(1)} ${total.toFixed(1)}`,
        );
        trail.setAttribute('stroke-opacity', (0.6 * opacity).toFixed(2));
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [reduce, stations]);

  if (reduce) return null;

  const look = LOOKS[Math.max(0, stage)];
  const chip = `KPA-${FIRST_ID + cycle} · ${look.chip}`;
  const chipW = 22 + chip.length * 6.4;

  return (
    <g>
      <path ref={pathRef} d={path} fill="none" stroke="none" />
      <path
        ref={trailRef}
        d={path}
        fill="none"
        stroke="url(#lb-path)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="0 100000"
        strokeOpacity="0"
      />

      {stations.map(
        (station, i) =>
          i <= stage && (
            <g key={`${cycle}-${i}`} transform={`translate(${station.x} ${station.y})`}>
              <circle r="14" fill="none" stroke={station.tone} strokeWidth="2" className="lb-ripple" />
              <circle
                r="14"
                fill="none"
                stroke={station.tone}
                strokeWidth="2.5"
                strokeOpacity="0.9"
                className="lb-pop"
              />
            </g>
          ),
      )}

      <g ref={moverRef} opacity="0">
        <circle r="26" fill={look.tone} fillOpacity="0.12" className="lb-halo" style={{ transition: 'fill 0.6s' }} />

        <g ref={bodyRef}>
          {stage <= 3 && (
            <g key={stage >= 3 ? 'gone' : 'bug'} className={stage >= 3 ? 'lb-vanish' : undefined}>
              <Bug tone={look.tone} moving={moving} />
            </g>
          )}
        </g>

        {stage === 1 && (
          <g key={`conf-${cycle}`} className="lb-pop">
            <circle cx="11" cy="-13" r="6.5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            <path d="M 11 -16.5 L 11 -12.5 M 11 -10.2 L 11 -10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
        {stage === 2 && (
          <circle
            key={`prog-${cycle}`}
            r="19"
            fill="none"
            stroke={look.tone}
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinecap="round"
            className="lb-spin"
          />
        )}
        {stage === 3 && (
          <g key={`fixed-${cycle}`} className="lb-pop">
            <circle r="13" fill="#16a34a" stroke="#fff" strokeWidth="2" />
            <path
              d="M -5.5 0.5 L -1.5 4.5 L 6 -4"
              fill="none"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        {stage === 4 && (
          <g key={`verified-${cycle}`} className="lb-pop">
            <path
              d="M 0 -16 L 13 -11 L 13 0 C 13 8 7 13 0 16 C -7 13 -13 8 -13 0 L -13 -11 Z"
              fill="#059669"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M -5.5 0 L -1.5 4 L 6 -4.5"
              fill="none"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        {stage >= 3 && <Burst key={`burst-${cycle}-${stage}`} tone={look.tone} stars={stage === 4} />}

        <g key={`chip-${cycle}-${stage}`} transform="translate(0 -42)" className="lb-chip">
          <rect
            x={-chipW / 2}
            y="-11"
            width={chipW}
            height="22"
            rx="11"
            fill="#ffffff"
            fillOpacity="0.95"
            stroke={look.tone}
            strokeOpacity="0.45"
          />
          <circle cx={-chipW / 2 + 11} r="3.5" fill={look.tone} />
          <text
            x={-chipW / 2 + 19}
            y="4"
            fontSize="11"
            fontWeight="600"
            fill="#334155"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {chip}
          </text>
        </g>
      </g>
    </g>
  );
}

function Bug({ tone, moving }: { tone: string; moving: boolean }) {
  const offsets = [-5, 0, 5];
  const leg = (x: number, side: 1 | -1) => `M ${x} ${5 * side} L ${x - 3} ${12 * side}`;
  return (
    <g>
      <g
        className={moving ? 'lb-legs-a' : undefined}
        stroke="#334155"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      >
        {offsets.map((x, i) => (
          <path key={x} d={leg(x, i % 2 ? 1 : -1)} />
        ))}
      </g>
      <g
        className={moving ? 'lb-legs-b' : undefined}
        stroke="#334155"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      >
        {offsets.map((x, i) => (
          <path key={x} d={leg(x, i % 2 ? -1 : 1)} />
        ))}
      </g>
      <path
        d="M 13 -3 Q 17 -9 20 -8 M 13 3 Q 17 9 20 8"
        stroke="#334155"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="11" r="4.5" fill="#1e293b" />
      <ellipse rx="11" ry="8.5" stroke="#ffffff" strokeWidth="1.5" style={{ fill: tone, transition: 'fill 0.6s' }} />
      <path d="M -11 0 L 7 0" stroke="#0f172a" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="-4" cy="-4" r="1.8" fill="#0f172a" fillOpacity="0.4" />
      <circle cx="-4" cy="4" r="1.8" fill="#0f172a" fillOpacity="0.4" />
      <circle cx="2.5" cy="-3.5" r="1.4" fill="#0f172a" fillOpacity="0.4" />
      <circle cx="2.5" cy="3.5" r="1.4" fill="#0f172a" fillOpacity="0.4" />
      <ellipse cx="-1" cy="-4.5" rx="5" ry="1.8" fill="#ffffff" fillOpacity="0.35" />
    </g>
  );
}

function Burst({ tone, stars }: { tone: string; stars: boolean }) {
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + 0.2;
        const dist = 30 + (i % 2) * 8;
        const style = {
          '--dx': `${(Math.cos(angle) * dist).toFixed(1)}px`,
          '--dy': `${(Math.sin(angle) * dist).toFixed(1)}px`,
        } as CSSProperties;
        return stars ? (
          <path
            key={i}
            d="M 0 -4 L 1 -1 L 4 0 L 1 1 L 0 4 L -1 1 L -4 0 L -1 -1 Z"
            fill={i % 2 ? '#fbbf24' : tone}
            className="lb-burst"
            style={style}
          />
        ) : (
          <circle key={i} r={i % 2 ? 2 : 2.8} fill={i % 2 ? '#86efac' : tone} className="lb-burst" style={style} />
        );
      })}
    </g>
  );
}
