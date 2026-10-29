import { memo } from 'react';
import type { Binding, MouseTarget } from '../types';
import { keyName, MAIN_ROWS, NAV_ROWS, TARGET_BY_ID, type VKey } from '../lib/keys';

interface PickerProps {
  bindings: Binding[];
  /** Salida seleccionada en el editor. */
  selected: string;
  /** Entradas físicas pulsadas ahora mismo (para resaltarlas). */
  pressed: Set<number>;
  onToggle: (vk: number) => void;
}

function targetsOf(bindings: Binding[], vk: number) {
  return bindings.filter((b) => b.input === vk).map((b) => TARGET_BY_ID[b.target]).filter(Boolean);
}

function Key({ k, bindings, selected, pressed, onToggle, cols }: { k: VKey; cols: number } & PickerProps) {
  const span = Math.round((k.w ?? 1) * 4);
  if (k.gap) return <span style={{ gridColumn: `span ${span}` }} />;
  const targets = targetsOf(bindings, k.vk);
  const mine = targets.some((t) => t.id === selected);
  const others = targets.filter((t) => t.id !== selected);
  const title = targets.length
    ? `${keyName(k.vk)} → ${targets.map((t) => t.name).join(', ')}`
    : `${keyName(k.vk)} · sin asignar`;
  return (
    <button
      id={`vk-${k.vk.toString(16)}-${cols}-${k.label.length}`}
      className={`vkey ${targets.length ? 'bound' : ''} ${mine ? 'mine' : ''} ${pressed.has(k.vk) ? 'pressed' : ''}`}
      style={{ gridColumn: `span ${span}`, ...(targets[0] ? { ['--kc' as string]: targets[0].color } : {}) }}
      title={title}
      onClick={() => onToggle(k.vk)}
    >
      <span className="vkey-label">{k.label}</span>
      {targets.length > 0 && (
        <span className="vkey-badges">
          {(mine ? [TARGET_BY_ID[selected], ...others] : others).slice(0, 2).map((t) => (
            <i key={t.id} style={{ background: t.color }}>{t.short}</i>
          ))}
          {targets.length > 2 && <i className="more">+{targets.length - 2}</i>}
        </span>
      )}
    </button>
  );
}

/** Teclado virtual ES (ISO): clic en una tecla = asignar / quitar de la salida seleccionada. */
export const VirtualKeyboard = memo(function VirtualKeyboard(props: PickerProps) {
  return (
    <div className="vkb" role="group" aria-label="Teclado virtual">
      <div className="vkb-main">
        {MAIN_ROWS.map((row, i) => (
          <div key={i} className={`vkb-row ${i === 0 ? 'fn' : ''}`} style={{ gridTemplateColumns: 'repeat(60, 1fr)' }}>
            {row.map((k, j) => <Key key={j} k={k} cols={i} {...props} />)}
          </div>
        ))}
      </div>
      <div className="vkb-nav">
        {NAV_ROWS.map((row, i) => (
          <div key={i} className={`vkb-row ${i === 0 ? 'fn' : ''}`} style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
            {row.map((k, j) => <Key key={j} k={k} cols={100 + i} {...props} />)}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Ratón                                                                */
/* ------------------------------------------------------------------ */
const MOUSE_PARTS: { vk: number; label: string }[] = [
  { vk: 0x01, label: 'Clic izquierdo' },
  { vk: 0x02, label: 'Clic derecho' },
  { vk: 0x04, label: 'Clic central (rueda)' },
  { vk: 0x100, label: 'Rueda arriba' },
  { vk: 0x101, label: 'Rueda abajo' },
  { vk: 0x06, label: 'Lateral delantero (X2)' },
  { vk: 0x05, label: 'Lateral trasero (X1)' },
];

const MOUSE_TARGET_TEXT: Record<MouseTarget, string> = { RS: 'Stick derecho', LS: 'Stick izquierdo', NONE: 'Desactivado' };

export const MouseDiagram = memo(function MouseDiagram({ bindings, selected, pressed, onToggle, mouseTarget }: PickerProps & { mouseTarget: MouseTarget }) {
  const part = (vk: number) => {
    const ts = targetsOf(bindings, vk);
    const mine = ts.some((t) => t.id === selected);
    return {
      className: `mpart ${ts.length ? 'bound' : ''} ${mine ? 'mine' : ''} ${pressed.has(vk) ? 'pressed' : ''}`,
      style: ts[0] ? { ['--kc' as string]: ts[0].color } : undefined,
      onClick: () => onToggle(vk),
      'data-vk': vk,
    };
  };
  const short = (vk: number) => targetsOf(bindings, vk).map((t) => t.short).join(' · ');

  return (
    <div className="mouse-picker">
      <svg viewBox="0 0 200 300" className="mouse-svg" role="group" aria-label="Ratón virtual">
        <path className="mbody" d="M100 8 C160 8 182 58 182 122 L182 200 C182 262 146 292 100 292 C54 292 18 262 18 200 L18 122 C18 58 40 8 100 8 Z" />
        <path {...part(0x01)} d="M95 13 C50 15 23 52 22 116 L95 116 Z" />
        <path {...part(0x02)} d="M105 13 C150 15 177 52 178 116 L105 116 Z" />
        <rect {...part(0x100)} x={88} y={32} width={24} height={20} rx={8} />
        <rect {...part(0x04)} x={88} y={54} width={24} height={22} rx={4} />
        <rect {...part(0x101)} x={88} y={78} width={24} height={20} rx={8} />
        <path d="M95 45 L100 39 L105 45 M95 85 L100 91 L105 85" className="mglyph" />
        <rect {...part(0x06)} x={10} y={134} width={14} height={36} rx={6} />
        <rect {...part(0x05)} x={10} y={176} width={14} height={36} rx={6} />
        <text className="mlabel" x={58} y={84}>{short(0x01) || 'L'}</text>
        <text className="mlabel" x={142} y={84}>{short(0x02) || 'R'}</text>
        <g className={`mmove ${mouseTarget === 'NONE' ? 'off' : ''}`}>
          <circle cx={100} cy={200} r={30} />
          <path d="M100 178 v44 M78 200 h44 M100 178 l-5 6 M100 178 l5 6 M100 222 l-5 -6 M100 222 l5 -6 M78 200 l6 -5 M78 200 l6 5 M122 200 l-6 -5 M122 200 l-6 5" />
          <text x={100} y={252}>{mouseTarget === 'NONE' ? 'Movimiento: off' : `Movimiento → ${mouseTarget}`}</text>
        </g>
      </svg>
      <div className="mouse-legend">
        {MOUSE_PARTS.map((p) => {
          const ts = targetsOf(bindings, p.vk);
          return (
            <button key={p.vk} id={`mouse-${p.vk.toString(16)}`} className={`mrow ${ts.some((t) => t.id === selected) ? 'mine' : ''} ${pressed.has(p.vk) ? 'pressed' : ''}`} onClick={() => onToggle(p.vk)}>
              <span>{p.label}</span>
              <span className="row" style={{ gap: 4 }}>
                {ts.length ? ts.map((t) => <i key={t.id} className="tbadge" style={{ background: t.color }}>{t.short}</i>) : <em>—</em>}
              </span>
            </button>
          );
        })}
        <div className="mrow static"><span>Movimiento</span><em>{MOUSE_TARGET_TEXT[mouseTarget]}</em></div>
      </div>
    </div>
  );
});
