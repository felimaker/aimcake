import { memo } from 'react';
import type { GamepadSnapshot } from '../types';
import { XB } from '../types';

interface Props {
  state: GamepadSnapshot;
}

const STICK_TRAVEL = 22;

/** Gradientes compartidos por todas las vistas del mando. */
export function ControllerDefs() {
  return (
    <defs>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="hsl(222 16% 21%)" />
        <stop offset="1" stopColor="hsl(222 22% 10%)" />
      </linearGradient>
      <radialGradient id="capGrad" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stopColor="hsl(222 12% 30%)" />
        <stop offset="1" stopColor="hsl(222 18% 13%)" />
      </radialGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="hsl(142 88% 52%)" />
        <stop offset="1" stopColor="hsl(186 95% 55%)" />
      </linearGradient>
    </defs>
  );
}

interface GraphicProps {
  state: GamepadSnapshot;
  /** Salida seleccionada en el editor de mapeo (se resalta). */
  selected?: string | null;
  /** Si se indica, las partes del mando son clicables y devuelven el id de salida. */
  onPick?: (target: string) => void;
  /** Etiqueta bajo el stick derecho. */
  rsLabel?: string;
  lsLabel?: string;
}

function Stick({ cx, cy, x, y, pressed, label, prefix, thumb, g }: {
  cx: number; cy: number; x: number; y: number; pressed: boolean; label: string; prefix: 'LS' | 'RS'; thumb: string; g: Helpers;
}) {
  const dx = (x / 32767) * STICK_TRAVEL;
  const dy = (-y / 32767) * STICK_TRAVEL;
  const active = Math.abs(x) > 600 || Math.abs(y) > 600;
  const arrows: [string, number][] = [['UP', 0], ['RIGHT', 90], ['DOWN', 180], ['LEFT', 270]];
  return (
    <g>
      <circle className="well" cx={cx} cy={cy} r={42} />
      <circle cx={cx} cy={cy} r={STICK_TRAVEL} fill="none" stroke="hsl(186 95% 55% / 0.14)" strokeDasharray="3 4" />
      <line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy} className="trail" />
      <circle
        {...g.pick(thumb)}
        className={`cap ${pressed ? 'on' : ''} ${g.sel(thumb)}`}
        cx={cx + dx} cy={cy + dy} r={27}
        style={active && !pressed ? { stroke: 'hsl(186 95% 55% / 0.8)', strokeWidth: 2 } : undefined}
      />
      <circle cx={cx + dx} cy={cy + dy} r={17} fill="none" stroke="hsl(0 0% 100% / 0.06)" pointerEvents="none" />
      {g.interactive && arrows.map(([dir, rot]) => {
        const id = `${prefix}_${dir}`;
        return (
          <path
            key={id}
            {...g.pick(id)}
            className={`stick-arrow ${g.sel(id)}`}
            d="M-9 -47 L0 -57 L9 -47 Z"
            transform={`translate(${cx} ${cy}) rotate(${rot})`}
          />
        );
      })}
      <text className="tiny" x={cx} y={cy + (g.interactive ? 74 : 62)}>{label}</text>
    </g>
  );
}

function Face({ cx, cy, label, color, on, g }: { cx: number; cy: number; label: string; color: string; on: boolean; g: Helpers }) {
  return (
    <g {...g.pick(label)} className={`btn-face ${on ? 'on' : ''} ${g.sel(label)}`} style={{ color }}>
      <circle cx={cx} cy={cy} r={17} fill={color} />
      <text className="label" x={cx} y={cy + 1}>{label}</text>
    </g>
  );
}

function Trigger({ x, value, label, side, g }: { x: number; value: number; label: string; side: 'left' | 'right'; g: Helpers }) {
  const w = 108;
  return (
    <g {...g.pick(label)} className={`trigger ${g.sel(label)}`}>
      <rect className="trigger-track" x={x} y={6} width={w} height={14} rx={7} />
      <rect x={x} y={6} width={(value / 255) * w} height={14} rx={7} fill="url(#accentGrad)" style={{ transition: 'width 60ms linear', filter: value ? 'drop-shadow(0 0 8px hsl(142 88% 52% / .8))' : undefined }} />
      <text className="tiny" x={side === 'left' ? x - 18 : x + w + 18} y={17}>{label}</text>
    </g>
  );
}

interface Helpers {
  interactive: boolean;
  pick: (id: string) => { onClick?: () => void; 'data-target'?: string };
  sel: (id: string) => string;
}

/** Dibujo del mando en coordenadas 640×430 (sin `<svg>` contenedor). */
export function ControllerGraphic({ state, selected, onPick, rsLabel = 'RS · RATÓN', lsLabel = 'LS' }: GraphicProps) {
  const on = (bit: number) => (state.buttons & bit) !== 0;
  const g: Helpers = {
    interactive: !!onPick,
    pick: (id) => (onPick ? { onClick: () => onPick(id), 'data-target': id } : {}),
    sel: (id) => (selected === id ? 'sel' : ''),
  };
  return (
    <g className={onPick ? 'interactive' : undefined}>
      <Trigger x={120} value={state.lt} label="LT" side="left" g={g} />
      <Trigger x={412} value={state.rt} label="RT" side="right" g={g} />

      {/* Bumpers */}
      <path {...g.pick('LB')} d="M120 74 Q140 50 230 52 L236 72 Q170 70 128 86 Z" className={`seg ${on(XB.LB) ? 'on' : ''} ${g.sel('LB')}`} />
      <path {...g.pick('RB')} d="M520 74 Q500 50 410 52 L404 72 Q470 70 512 86 Z" className={`seg ${on(XB.RB) ? 'on' : ''} ${g.sel('RB')}`} />
      <text className="tiny" x={168} y={48}>LB</text>
      <text className="tiny" x={472} y={48}>RB</text>

      {/* Cuerpo */}
      <path
        className="body"
        d="M190 76 C240 66 400 66 450 76 C520 86 560 106 585 166 C615 241 640 336 610 381 C585 416 540 406 505 366 C480 336 460 311 420 306 L220 306 C180 311 160 336 135 366 C100 406 55 416 30 381 C0 336 25 241 55 166 C80 106 120 86 190 76 Z"
      />

      {/* Guía */}
      <g {...g.pick('GUIDE')}>
        <circle cx={320} cy={118} r={22} className={`seg ${on(XB.GUIDE) ? 'on' : ''} ${g.sel('GUIDE')}`} />
        <path d="M311 109 L329 127 M329 109 L311 127" stroke="hsl(222 40% 6% / 0.7)" strokeWidth={3} strokeLinecap="round" pointerEvents="none" />
      </g>

      {/* Back / Start */}
      <rect {...g.pick('BACK')} x={262} y={160} width={26} height={14} rx={7} className={`seg ${on(XB.BACK) ? 'on' : ''} ${g.sel('BACK')}`} />
      <rect {...g.pick('START')} x={352} y={160} width={26} height={14} rx={7} className={`seg ${on(XB.START) ? 'on' : ''} ${g.sel('START')}`} />
      {onPick && <><text className="tiny" x={275} y={192}>VIEW</text><text className="tiny" x={365} y={192}>MENU</text></>}

      <Stick cx={178} cy={170} x={state.lx} y={state.ly} pressed={on(XB.LTHUMB)} label={lsLabel} prefix="LS" thumb="LTHUMB" g={g} />
      <Stick cx={404} cy={252} x={state.rx} y={state.ry} pressed={on(XB.RTHUMB)} label={rsLabel} prefix="RS" thumb="RTHUMB" g={g} />

      {/* Cruceta */}
      <g transform="translate(246 252)">
        <circle r={40} className="well" />
        <rect {...g.pick('UP')} x={-11} y={-33} width={22} height={24} rx={4} className={`seg ${on(XB.UP) ? 'on' : ''} ${g.sel('UP')}`} />
        <rect {...g.pick('DOWN')} x={-11} y={9} width={22} height={24} rx={4} className={`seg ${on(XB.DOWN) ? 'on' : ''} ${g.sel('DOWN')}`} />
        <rect {...g.pick('LEFT')} x={-33} y={-11} width={24} height={22} rx={4} className={`seg ${on(XB.LEFT) ? 'on' : ''} ${g.sel('LEFT')}`} />
        <rect {...g.pick('RIGHT')} x={9} y={-11} width={24} height={22} rx={4} className={`seg ${on(XB.RIGHT) ? 'on' : ''} ${g.sel('RIGHT')}`} />
      </g>

      {/* ABXY */}
      <Face cx={470} cy={128} label="Y" color="#ffc531" on={on(XB.Y)} g={g} />
      <Face cx={432} cy={168} label="X" color="#3fa7ff" on={on(XB.X)} g={g} />
      <Face cx={508} cy={168} label="B" color="#ff5c6c" on={on(XB.B)} g={g} />
      <Face cx={470} cy={208} label="A" color="#3ddc84" on={on(XB.A)} g={g} />
    </g>
  );
}

function ControllerViewer({ state }: Props) {
  return (
    <div className="controller-wrap">
      <svg className="controller-svg" viewBox="0 0 640 430" role="img" aria-label="Vista en vivo del mando virtual Xbox 360">
        <ControllerDefs />
        <ControllerGraphic state={state} />
      </svg>

      <div className="axis-readout" style={{ width: '100%' }}>
        <div><span>LS X / Y</span><strong>{fmt(state.lx)} / {fmt(state.ly)}</strong></div>
        <div><span>RS X</span><strong>{fmt(state.rx)}</strong></div>
        <div><span>RS Y</span><strong>{fmt(state.ry)}</strong></div>
        <div><span>LT / RT</span><strong>{state.lt} / {state.rt}</strong></div>
      </div>
    </div>
  );
}

function fmt(v: number) {
  return `${v >= 0 ? '+' : ''}${Math.round((v / 32767) * 100)}%`;
}

export default memo(ControllerViewer);
