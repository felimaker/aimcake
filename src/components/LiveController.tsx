import { memo, useId } from 'react';
import type { GamepadSnapshot } from '../types';
import { XB } from '../types';

interface Props {
  state: GamepadSnapshot;
  /** Mando virtual conectado (emulando). */
  connected: boolean;
  /** Stick al que va el movimiento del ratón (se etiqueta en la telemetría). */
  mouseStick?: 'LS' | 'RS' | 'NONE';
}

const TRAVEL = 15;
const BODY =
  'M320 92 C380 92 420 84 460 80 C520 74 566 96 588 140 C612 188 632 262 636 318 C640 370 616 404 578 404 ' +
  'C546 404 524 384 504 354 C484 324 462 300 420 298 C360 306 280 306 220 298 C178 300 156 324 136 354 ' +
  'C116 384 94 404 62 404 C24 404 0 370 4 318 C8 262 28 188 52 140 C74 96 120 74 180 80 C220 84 260 92 320 92 Z';

const FACE: { id: keyof typeof XB; x: number; y: number; color: string }[] = [
  { id: 'Y', x: 474, y: 142, color: '#ffc531' },
  { id: 'X', x: 436, y: 180, color: '#3fa7ff' },
  { id: 'B', x: 512, y: 180, color: '#ff5c6c' },
  { id: 'A', x: 474, y: 218, color: '#3ddc84' },
];

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round((v / 32767) * 100))}%`;

/* ------------------------------------------------------------------ */
/* Telemetría                                                           */
/* ------------------------------------------------------------------ */
function StickRadar({ label, x, y, pressed, tag }: { label: string; x: number; y: number; pressed: boolean; tag?: string }) {
  const px = 50 + (x / 32767) * 40;
  const py = 50 - (y / 32767) * 40;
  const mag = Math.min(1, Math.hypot(x, y) / 32767);
  return (
    <div className={`lc-radar ${mag > 0.02 ? 'live' : ''} ${pressed ? 'pressed' : ''}`}>
      <div className="lc-radar-head"><strong>{label}</strong>{tag && <em>{tag}</em>}</div>
      <svg viewBox="0 0 100 100" aria-label={`Stick ${label}`}>
        <circle cx="50" cy="50" r="46" className="r-bg" />
        <circle cx="50" cy="50" r="30" className="r-ring" />
        <circle cx="50" cy="50" r="14" className="r-ring" />
        <path d="M50 6 V94 M6 50 H94" className="r-cross" />
        <circle cx="50" cy="50" r={4 + mag * 40} className="r-mag" />
        <line x1="50" y1="50" x2={px} y2={py} className="r-trail" />
        <circle cx={px} cy={py} r="5.5" className="r-dot" />
      </svg>
      <div className="lc-radar-vals"><span>X {pct(x)}</span><span>Y {pct(y)}</span></div>
    </div>
  );
}

function TriggerGauge({ label, value }: { label: string; value: number }) {
  const f = value / 255;
  return (
    <div className={`lc-gauge ${value > 0 ? 'live' : ''}`}>
      <strong>{label}</strong>
      <div className="lc-gauge-track"><i style={{ height: `${f * 100}%` }} /></div>
      <span>{Math.round(f * 100)}%</span>
    </div>
  );
}

const PILLS: [string, number, string?][] = [
  ['A', XB.A, '#3ddc84'], ['B', XB.B, '#ff5c6c'], ['X', XB.X, '#3fa7ff'], ['Y', XB.Y, '#ffc531'], ['LB', XB.LB],
  ['RB', XB.RB], ['L3', XB.LTHUMB], ['R3', XB.RTHUMB], ['VIEW', XB.BACK], ['MENU', XB.START],
  ['▲', XB.UP], ['▼', XB.DOWN], ['◀', XB.LEFT], ['▶', XB.RIGHT], ['GUIDE', XB.GUIDE],
];

/* ------------------------------------------------------------------ */
function LiveController({ state, connected, mouseStick = 'RS' }: Props) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const on = (bit: number) => (state.buttons & bit) !== 0;

  const stick = (cx: number, cy: number, x: number, y: number, pressed: boolean) => {
    const dx = (x / 32767) * TRAVEL;
    const dy = (-y / 32767) * TRAVEL;
    const moved = Math.hypot(x, y) > 1200;
    return (
      <g className={`lc-stick ${pressed ? 'pressed' : ''} ${moved ? 'moved' : ''}`}>
        <circle cx={cx} cy={cy} r={44} fill={url('well')} className="lc-well" />
        <circle cx={cx} cy={cy} r={TRAVEL + 2} className="lc-travel" />
        {moved && <line x1={cx} y1={cy} x2={cx + dx * 2.2} y2={cy + dy * 2.2} className="lc-dir" />}
        <g transform={`translate(${cx + dx} ${cy + dy})`}>
          <circle r={31} className="lc-cap-shadow" />
          <circle r={29} fill={url('cap')} className="lc-cap" />
          <circle r={22} className="lc-cap-inner" />
          <circle r={25.5} className="lc-cap-grip" />
        </g>
      </g>
    );
  };

  const dpadArm = (bit: number, d: string) => <path d={d} className={`lc-dpad-arm ${on(bit) ? 'on' : ''}`} />;

  return (
    <div className={`lc ${connected ? 'connected' : 'off'} ${state.paused ? 'paused' : ''}`}>
      <div className="lc-stage">
        <div className="lc-halo" />
        <svg className="lc-svg" viewBox="0 0 640 440" role="img" aria-label="Vista en vivo del mando virtual Xbox 360">
          <defs>
            <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="hsl(222 14% 23%)" />
              <stop offset="0.55" stopColor="hsl(222 18% 14%)" />
              <stop offset="1" stopColor="hsl(222 24% 8%)" />
            </linearGradient>
            <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="hsl(210 40% 90% / 0.35)" />
              <stop offset="0.4" stopColor="hsl(210 40% 90% / 0.06)" />
              <stop offset="1" stopColor="hsl(210 40% 90% / 0.02)" />
            </linearGradient>
            <radialGradient id={id('sheen')} cx="0.5" cy="0" r="0.75">
              <stop offset="0" stopColor="hsl(0 0% 100% / 0.12)" />
              <stop offset="1" stopColor="hsl(0 0% 100% / 0)" />
            </radialGradient>
            <radialGradient id={id('well')} cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="hsl(222 30% 4%)" />
              <stop offset="1" stopColor="hsl(222 24% 9%)" />
            </radialGradient>
            <radialGradient id={id('cap')} cx="0.38" cy="0.3" r="0.85">
              <stop offset="0" stopColor="hsl(222 10% 34%)" />
              <stop offset="0.6" stopColor="hsl(222 14% 18%)" />
              <stop offset="1" stopColor="hsl(222 18% 11%)" />
            </radialGradient>
            <radialGradient id={id('btn')} cx="0.4" cy="0.3" r="0.8">
              <stop offset="0" stopColor="hsl(222 12% 26%)" />
              <stop offset="1" stopColor="hsl(222 20% 9%)" />
            </radialGradient>
            <linearGradient id={id('accent')} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="hsl(142 88% 52%)" />
              <stop offset="1" stopColor="hsl(186 95% 55%)" />
            </linearGradient>
            <clipPath id={id('clip')}><path d={BODY} /></clipPath>
          </defs>

          {/* Gatillos */}
          {([['LT', 112, -14, state.lt], ['RT', 438, 14, state.rt]] as const).map(([name, x, rot, v]) => (
            <g key={name} transform={`rotate(${rot} ${x + 45} 50)`} className="lc-trigger">
              <rect x={x} y={26} width={90} height={50} rx={20} className="lc-trigger-base" />
              <rect x={x} y={26} width={90} height={50} rx={20} fill={url('accent')} style={{ opacity: v / 255 }} className="lc-trigger-fill" />
              <text x={x + 45} y={46} className="lc-label">{name}</text>
            </g>
          ))}

          {/* Bumpers */}
          <path d="M58 132 C78 94 122 68 192 64" className={`lc-bumper ${on(XB.LB) ? 'on' : ''}`} />
          <path d="M582 132 C562 94 518 68 448 64" className={`lc-bumper ${on(XB.RB) ? 'on' : ''}`} />

          {/* Cuerpo */}
          <path d={BODY} fill={url('body')} className="lc-body" />
          <g clipPath={url('clip')}>
            <ellipse cx="320" cy="96" rx="300" ry="120" fill={url('sheen')} />
            <path d="M120 300 C200 250 440 250 520 300" className="lc-seam" />
          </g>
          <path d={BODY} fill="none" stroke={url('rim')} strokeWidth="1.6" />

          {/* Guía */}
          <g className={`lc-guide ${on(XB.GUIDE) ? 'on' : ''}`}>
            <circle cx={320} cy={138} r={25} className="lc-guide-ring" />
            <circle cx={320} cy={138} r={19} fill={url('btn')} className="lc-guide-btn" />
            <path d="M311 129 C316 132 318 135 320 138 C322 135 324 132 329 129 M311 147 C316 144 318 141 320 138 C322 141 324 144 329 147" className="lc-guide-x" />
          </g>

          {/* View / Share / Menu */}
          <g className={`lc-small ${on(XB.BACK) ? 'on' : ''}`}>
            <circle cx={266} cy={186} r={11} fill={url('btn')} />
            <path d="M261 183 h7 v5 h-7 z M264 181 h7 v5" className="lc-small-icon" />
          </g>
          <rect x={311} y={203} width={18} height={10} rx={5} fill={url('btn')} className="lc-share" />
          <g className={`lc-small ${on(XB.START) ? 'on' : ''}`}>
            <circle cx={374} cy={186} r={11} fill={url('btn')} />
            <path d="M369 182 h10 M369 186 h10 M369 190 h10" className="lc-small-icon" />
          </g>

          {/* Sticks */}
          {stick(178, 180, state.lx, state.ly, on(XB.LTHUMB))}
          {stick(404, 270, state.rx, state.ry, on(XB.RTHUMB))}

          {/* Cruceta */}
          <g transform="translate(246 270)">
            <circle r={42} fill={url('well')} className="lc-well" />
            <path d="M-12 -34 h24 a4 4 0 0 1 4 4 v18 h18 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-18 v18 a4 4 0 0 1 -4 4 h-24 a4 4 0 0 1 -4 -4 v-18 h-18 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4 h18 v-18 a4 4 0 0 1 4 -4 z" fill={url('btn')} className="lc-dpad" />
            {dpadArm(XB.UP, 'M-11 -33 h22 v21 l-11 9 l-11 -9 z')}
            {dpadArm(XB.DOWN, 'M-11 33 h22 v-21 l-11 -9 l-11 9 z')}
            {dpadArm(XB.LEFT, 'M-33 -11 v22 h21 l9 -11 l-9 -11 z')}
            {dpadArm(XB.RIGHT, 'M33 -11 v22 h-21 l-9 -11 l9 -11 z')}
            <circle r={5} className="lc-dpad-dot" />
          </g>

          {/* ABXY */}
          {FACE.map((f) => (
            <g key={f.id} className={`lc-face ${on(XB[f.id]) ? 'on' : ''}`} style={{ color: f.color }}>
              <circle cx={f.x} cy={f.y} r={18} fill={url('btn')} className="lc-face-btn" />
              <circle cx={f.x} cy={f.y} r={18} className="lc-face-fill" />
              <text x={f.x} y={f.y + 1} className="lc-face-label">{f.id}</text>
            </g>
          ))}

          {/* LED de estado */}
          <circle cx={320} cy={100} r={2.5} className="lc-led" />
        </svg>
        {!connected && <div className="lc-overlay"><span>Mando virtual desconectado</span></div>}
        {connected && state.paused && <div className="lc-overlay paused"><span>En pausa</span></div>}
      </div>

      <div className="lc-telemetry">
        <TriggerGauge label="LT" value={state.lt} />
        <StickRadar label="LS" x={state.lx} y={state.ly} pressed={on(XB.LTHUMB)} tag={mouseStick === 'LS' ? 'Ratón' : undefined} />
        <div className="lc-pills">
          {PILLS.map(([name, bit, color]) => (
            <span key={name} className={`lc-pill ${on(bit) ? 'on' : ''}`} style={color ? { ['--pc' as string]: color } : undefined}>{name}</span>
          ))}
        </div>
        <StickRadar label="RS" x={state.rx} y={state.ry} pressed={on(XB.RTHUMB)} tag={mouseStick === 'RS' ? 'Ratón' : undefined} />
        <TriggerGauge label="RT" value={state.rt} />
      </div>
    </div>
  );
}

export default memo(LiveController);
