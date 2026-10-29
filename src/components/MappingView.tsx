import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Binding, EngineSettings, GamepadSnapshot, MouseTarget } from '../types';
import { XB } from '../types';
import { DEFAULT_BINDINGS } from '../lib/curve';
import { isMouseInput, keyName, TARGET_BY_ID, vkFromKeyboardEvent, vkFromMouseButton } from '../lib/keys';
import { ControllerDefs, ControllerGraphic } from './ControllerViewer';
import CaptureOverlay from './CaptureOverlay';
import { MouseDiagram, VirtualKeyboard } from './InputPickers';
import { IconAlert, IconKeyboard, IconMouse, IconReset, IconTarget, IconTrash } from './Icons';

interface Props {
  settings: EngineSettings;
  onChange: (s: EngineSettings) => void;
  live: GamepadSnapshot;
}

/* ------------------------------------------------------------------ */
/* Geometría del lienzo (viewBox 1200×640; mando desplazado 280,120)    */
/* ------------------------------------------------------------------ */
const OX = 280;
const OY = 120;
type Side = 'left' | 'right' | 'bottom';
interface Single { id: string; x: number; y: number; w: number; h: number; side: Side; anchor: [number, number]; path?: string }

const SINGLES: Single[] = [
  { id: 'LT', x: 20, y: 22, w: 230, h: 46, side: 'left', anchor: [OX + 120, OY + 13] },
  { id: 'LB', x: 20, y: 80, w: 230, h: 46, side: 'left', anchor: [OX + 124, OY + 76] },
  { id: 'RT', x: 950, y: 22, w: 230, h: 46, side: 'right', anchor: [OX + 520, OY + 13] },
  { id: 'RB', x: 950, y: 80, w: 230, h: 46, side: 'right', anchor: [OX + 516, OY + 76] },
  { id: 'Y', x: 950, y: 140, w: 230, h: 40, side: 'right', anchor: [OX + 487, OY + 128] },
  { id: 'B', x: 950, y: 186, w: 230, h: 40, side: 'right', anchor: [OX + 525, OY + 168] },
  { id: 'X', x: 950, y: 232, w: 230, h: 40, side: 'right', anchor: [OX + 432, OY + 185] },
  { id: 'A', x: 950, y: 278, w: 230, h: 40, side: 'right', anchor: [OX + 487, OY + 208] },
  { id: 'BACK', x: 380, y: 566, w: 140, h: 46, side: 'bottom', anchor: [OX + 276, OY + 176], path: 'M450 566 C450 470, 620 400, 556 296' },
  { id: 'GUIDE', x: 530, y: 566, w: 140, h: 46, side: 'bottom', anchor: [OX + 320, OY + 140], path: 'M600 566 L600 262' },
  { id: 'START', x: 680, y: 566, w: 140, h: 46, side: 'bottom', anchor: [OX + 364, OY + 176], path: 'M750 566 C750 470, 580 400, 644 296' },
];

interface Block { kind: 'LS' | 'RS' | 'DPAD'; x: number; y: number; w: number; h: number; side: Side; anchor: [number, number] }
const BLOCKS: Block[] = [
  { kind: 'LS', x: 20, y: 140, w: 230, h: 196, side: 'left', anchor: [OX + 136, OY + 170] },
  { kind: 'DPAD', x: 20, y: 352, w: 230, h: 196, side: 'left', anchor: [OX + 206, OY + 252] },
  { kind: 'RS', x: 950, y: 334, w: 230, h: 214, side: 'right', anchor: [OX + 446, OY + 252] },
];

function leader(from: [number, number], to: [number, number]) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = (x2 - x1) * 0.5;
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** ¿La salida está activa en el estado en vivo del mando? */
function isLive(id: string, s: GamepadSnapshot): boolean {
  const T = 8000;
  switch (id) {
    case 'LT': return s.lt > 0;
    case 'RT': return s.rt > 0;
    case 'LS_UP': return s.ly > T;
    case 'LS_DOWN': return s.ly < -T;
    case 'LS_LEFT': return s.lx < -T;
    case 'LS_RIGHT': return s.lx > T;
    case 'RS_UP': return s.ry > T;
    case 'RS_DOWN': return s.ry < -T;
    case 'RS_LEFT': return s.rx < -T;
    case 'RS_RIGHT': return s.rx > T;
    default: {
      const bit = (XB as Record<string, number>)[id];
      return bit ? (s.buttons & bit) !== 0 : false;
    }
  }
}

/* ------------------------------------------------------------------ */
export default function MappingView({ settings, onChange, live }: Props) {
  const [selected, setSelected] = useState('A');
  const [capture, setCapture] = useState<null | 'bind' | 'pause'>(null);
  const [pressed, setPressed] = useState<Set<number>>(() => new Set());
  const { bindings } = settings;
  const sel = TARGET_BY_ID[selected];

  const keysFor = useCallback((target: string) => bindings.filter((b) => b.target === target).map((b) => b.input), [bindings]);
  const setBindings = (next: Binding[]) => onChange({ ...settings, bindings: next });

  const toggle = (vk: number, target = selected) => {
    const exists = bindings.some((b) => b.input === vk && b.target === target);
    setBindings(exists ? bindings.filter((b) => !(b.input === vk && b.target === target)) : [...bindings, { input: vk, target }]);
  };
  const add = (vk: number, target = selected) => {
    if (bindings.some((b) => b.input === vk && b.target === target)) return;
    setBindings([...bindings, { input: vk, target }]);
  };

  // Resaltar en el teclado/ratón virtual las entradas físicas pulsadas.
  useEffect(() => {
    if (capture) return;
    const set = (vk: number | null, down: boolean) => {
      if (vk == null) return;
      setPressed((prev) => {
        if (prev.has(vk) === down) return prev;
        const n = new Set(prev);
        if (down) n.add(vk); else n.delete(vk);
        return n;
      });
    };
    const kd = (e: KeyboardEvent) => set(vkFromKeyboardEvent(e), true);
    const ku = (e: KeyboardEvent) => set(vkFromKeyboardEvent(e), false);
    const md = (e: MouseEvent) => set(vkFromMouseButton(e.button), true);
    const mu = (e: MouseEvent) => set(vkFromMouseButton(e.button), false);
    const wh = (e: WheelEvent) => {
      const vk = e.deltaY < 0 ? 0x100 : 0x101;
      set(vk, true);
      setTimeout(() => set(vk, false), 160);
    };
    const blur = () => setPressed(new Set());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('wheel', wh, { passive: true });
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('wheel', wh);
      window.removeEventListener('blur', blur);
    };
  }, [capture]);

  const liveSet = useMemo(() => new Set(Object.keys(TARGET_BY_ID).filter((id) => isLive(id, live))), [live]);
  const mouseOn = (stick: 'LS' | 'RS') => settings.mouseTarget === stick;

  /* ---------------- Fichas del lienzo ---------------- */
  const keyList = (target: string, max = 3, compact = false) => {
    const ks = keysFor(target);
    if (!ks.length) return <span className="callout-empty">{compact ? '—' : 'Sin asignar'}</span>;
    return (
      <>
        {ks.slice(0, max).map((vk) => (
          <span key={vk} className={`mini-key ${isMouseInput(vk) ? 'mouse' : ''}`}>{keyName(vk)}</span>
        ))}
        {ks.length > max && <span className="mini-key more">+{ks.length - max}</span>}
      </>
    );
  };

  const cell = (id: string, glyph: string) => {
    const ks = keysFor(id);
    return (
      <button
        key={id}
        id={`cell-${id}`}
        className={`dir-cell ${selected === id ? 'sel' : ''} ${liveSet.has(id) ? 'live' : ''} ${ks.length ? '' : 'empty'}`}
        style={{ ['--tc' as string]: TARGET_BY_ID[id].color }}
        onClick={() => setSelected(id)}
        title={TARGET_BY_ID[id].name}
      >
        <span className="dir-glyph">{glyph}</span>
        <span className="dir-key">{ks.length ? keyName(ks[0]) : '—'}{ks.length > 1 ? ` +${ks.length - 1}` : ''}</span>
      </button>
    );
  };

  const blockTitle: Record<Block['kind'], string> = { LS: 'Stick izquierdo', RS: 'Stick derecho', DPAD: 'Cruceta' };
  const blockIds: Record<Block['kind'], string[]> = {
    LS: ['LS_UP', 'LS_DOWN', 'LS_LEFT', 'LS_RIGHT', 'LTHUMB'],
    RS: ['RS_UP', 'RS_DOWN', 'RS_LEFT', 'RS_RIGHT', 'RTHUMB'],
    DPAD: ['UP', 'DOWN', 'LEFT', 'RIGHT'],
  };

  const renderBlock = (b: Block) => {
    const ids = blockIds[b.kind];
    const [up, down, left, right, center] = ids;
    const stick = b.kind === 'DPAD' ? null : (b.kind as 'LS' | 'RS');
    const active = ids.includes(selected);
    return (
      <foreignObject key={b.kind} x={b.x} y={b.y} width={b.w} height={b.h}>
        <div className={`callout-block ${b.side} ${active ? 'sel' : ''}`} style={{ ['--tc' as string]: TARGET_BY_ID[up].color }}>
          <div className="block-head">
            <span>{blockTitle[b.kind]}</span>
            {stick && mouseOn(stick) && <span className="mouse-flag"><IconMouse />Ratón</span>}
          </div>
          <div className="dir-grid">
            <span />
            {cell(up, '▲')}
            <span />
            {cell(left, '◀')}
            {center ? cell(center, b.kind === 'LS' ? 'L3' : 'R3') : <span className="dir-hub">✚</span>}
            {cell(right, '▶')}
            <span />
            {cell(down, '▼')}
            <span />
          </div>
          {stick && mouseOn(stick) && (
            <button className="block-foot" onClick={() => onChange({ ...settings, mouseTarget: 'NONE' })} title="Desactivar movimiento del ratón">
              Movimiento del ratón → {stick} · <u>desactivar</u>
            </button>
          )}
        </div>
      </foreignObject>
    );
  };

  const renderSingle = (c: Single) => {
    const t = TARGET_BY_ID[c.id];
    return (
      <foreignObject key={c.id} x={c.x} y={c.y} width={c.w} height={c.h}>
        <button
          id={`callout-${c.id}`}
          className={`callout ${c.side} ${selected === c.id ? 'sel' : ''} ${liveSet.has(c.id) ? 'live' : ''}`}
          style={{ ['--tc' as string]: t.color }}
          onClick={() => setSelected(c.id)}
          title={t.name}
        >
          <span className={`callout-badge ${t.group === 'face' ? 'round' : ''}`}>{t.short}</span>
          <span className="callout-keys">{c.side === 'bottom' ? keyList(c.id, 1, true) : keyList(c.id, 2)}</span>
        </button>
      </foreignObject>
    );
  };

  const edgeOf = (x: number, y: number, w: number, h: number, side: Side): [number, number] =>
    side === 'left' ? [x + w, y + h / 2] : side === 'right' ? [x, y + h / 2] : [x + w / 2, y];

  const selKeys = keysFor(selected);

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* --------------------------- Lienzo --------------------------- */}
      <section className="card mapper-card">
        <div className="card-title">
          <span className="row"><IconTarget style={{ width: 16, color: 'var(--accent)' }} /> Haz clic en un botón del mando o en una ficha para editarlo</span>
          <span className="row" style={{ gap: 8 }}>
            <span className="chip">{bindings.length} asignaciones</span>
          </span>
        </div>
        <svg className="controller-svg mapper-svg" viewBox="0 0 1200 640" role="img" aria-label="Mapa de asignaciones del mando">
          <ControllerDefs />
          <g transform={`translate(${OX} ${OY})`}>
            <ControllerGraphic
              state={live}
              selected={selected}
              onPick={setSelected}
              lsLabel={mouseOn('LS') ? 'LS · RATÓN' : 'LS'}
              rsLabel={mouseOn('RS') ? 'RS · RATÓN' : 'RS'}
            />
          </g>
          {/* Líneas guía */}
          <g className="leaders">
            {SINGLES.map((c) => {
              const from = edgeOf(c.x, c.y, c.w, c.h, c.side);
              return (
                <g key={c.id} className={`leader ${selected === c.id ? 'sel' : ''} ${liveSet.has(c.id) ? 'live' : ''}`} style={{ ['--tc' as string]: TARGET_BY_ID[c.id].color }}>
                  <path d={c.path ?? leader(from, c.anchor)} />
                  <circle cx={c.anchor[0]} cy={c.anchor[1]} r={3.5} />
                </g>
              );
            })}
            {BLOCKS.map((b) => {
              const from = edgeOf(b.x, b.y, b.w, b.h, b.side);
              const active = blockIds[b.kind].includes(selected);
              return (
                <g key={b.kind} className={`leader ${active ? 'sel' : ''}`} style={{ ['--tc' as string]: TARGET_BY_ID[blockIds[b.kind][0]].color }}>
                  <path d={leader(from, b.anchor)} />
                  <circle cx={b.anchor[0]} cy={b.anchor[1]} r={3.5} />
                </g>
              );
            })}
          </g>
          {SINGLES.map(renderSingle)}
          {BLOCKS.map(renderBlock)}
        </svg>
      </section>

      {/* --------------------------- Editor --------------------------- */}
      <section className="card editor-card" style={{ ['--tc' as string]: sel.color }}>
        <div className="editor-head">
          <div className="row" style={{ gap: 14 }}>
            <span className={`editor-badge ${sel.group === 'face' ? 'round' : ''}`}>{sel.short}</span>
            <div>
              <div className="faint" style={{ fontSize: 11.5, letterSpacing: '.12em', textTransform: 'uppercase' }}>Editando salida</div>
              <h2 style={{ fontSize: 20 }}>{sel.name}</h2>
            </div>
          </div>
          <div className="editor-keys">
            {selKeys.length === 0 && <span className="faint">Ninguna tecla asignada todavía</span>}
            {selKeys.map((vk) => (
              <span key={vk} className="keycap big">
                {isMouseInput(vk) ? <IconMouse style={{ width: 13 }} /> : <IconKeyboard style={{ width: 14 }} />}
                {keyName(vk)}
                <button aria-label={`Quitar ${keyName(vk)}`} onClick={() => toggle(vk)}>×</button>
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button id="capture-key" className="btn btn-primary" onClick={() => setCapture('bind')}>
              <IconTarget /> Pulsar tecla
            </button>
            <button id="clear-target" className="btn" disabled={!selKeys.length} onClick={() => setBindings(bindings.filter((b) => b.target !== selected))}>
              <IconTrash /> Limpiar
            </button>
          </div>
        </div>
        <p className="faint" style={{ margin: '4px 0 16px' }}>
          Haz clic en cualquier tecla o botón del ratón para <strong style={{ color: 'var(--text)' }}>asignarlo o quitarlo</strong> de <strong style={{ color: sel.color }}>{sel.name}</strong>.
          Las insignias de color muestran a qué salida va cada tecla. Las teclas físicas que pulses se iluminan.
        </p>
        <div className="pickers">
          <VirtualKeyboard bindings={bindings} selected={selected} pressed={pressed} onToggle={toggle} />
          <MouseDiagram bindings={bindings} selected={selected} pressed={pressed} onToggle={toggle} mouseTarget={settings.mouseTarget} />
        </div>
      </section>

      {/* --------------------------- Opciones --------------------------- */}
      <section className="card">
        <div className="card-title"><span>Opciones del perfil</span></div>
        <div className="options-grid">
          <div className="field">
            <label>Movimiento del ratón controla</label>
            <div className="segmented" role="radiogroup">
              {([['RS', 'Stick der.'], ['LS', 'Stick izq.'], ['NONE', 'Nada']] as [MouseTarget, string][]).map(([v, l]) => (
                <button key={v} id={`mouse-target-${v}`} className={settings.mouseTarget === v ? 'active' : ''} onClick={() => onChange({ ...settings, mouseTarget: v })}>{l}</button>
              ))}
            </div>
            <span className="slider-hint">Las teclas asignadas a direcciones del stick tienen prioridad.</span>
          </div>
          <div className="field">
            <label>Frecuencia de reporte</label>
            <div className="segmented" role="radiogroup">
              {[250, 500, 1000].map((hz) => (
                <button key={hz} id={`hz-${hz}`} className={settings.pollingHz === hz ? 'active' : ''} onClick={() => onChange({ ...settings, pollingHz: hz })}>{hz} Hz</button>
              ))}
            </div>
            <span className="slider-hint">1000 Hz = latencia mínima (más CPU).</span>
          </div>
          <div className="field">
            <label>Tecla de pausa</label>
            <div className="row">
              <span className="keycap big">{keyName(settings.pauseHotkey)}</span>
              <button id="change-pause" className="btn btn-sm" onClick={() => setCapture('pause')}>Cambiar</button>
            </div>
            <span className="slider-hint">Pausa/reanuda la emulación sin desconectar el mando.</span>
          </div>
          <label className="toggle" htmlFor="suppress-toggle" style={{ padding: 0, alignItems: 'flex-start' }}>
            <span className="toggle-text">
              <strong>Bloquear teclas mapeadas</strong>
              <span>El juego no recibe la tecla, solo el botón del mando.</span>
            </span>
            <button
              id="suppress-toggle"
              role="switch"
              aria-checked={settings.suppressKeys}
              className={`switch ${settings.suppressKeys ? 'on' : ''}`}
              style={{ border: 'none', cursor: 'pointer' }}
              onClick={() => onChange({ ...settings, suppressKeys: !settings.suppressKeys })}
            />
          </label>
        </div>
        <hr className="divider" />
        <div className="row-between">
          <span className="faint row"><IconAlert style={{ width: 15 }} /> Los cambios se guardan automáticamente en el perfil activo.</span>
          <div className="row">
            <button id="reset-bindings" className="btn btn-sm" onClick={() => setBindings(DEFAULT_BINDINGS)}><IconReset /> Mapeo por defecto</button>
            <button id="clear-bindings" className="btn btn-sm btn-danger" onClick={() => setBindings([])}><IconTrash /> Borrar todo</button>
          </div>
        </div>
      </section>

      {capture === 'bind' && (
        <CaptureOverlay
          title={`Asignar a ${sel.name}`}
          onCapture={(vk) => { add(vk); setCapture(null); }}
          onCancel={() => setCapture(null)}
        />
      )}
      {capture === 'pause' && (
        <CaptureOverlay
          title="Nueva tecla de pausa"
          allowMouse={false}
          onCapture={(vk) => { onChange({ ...settings, pauseHotkey: vk }); setCapture(null); }}
          onCancel={() => setCapture(null)}
        />
      )}
    </div>
  );
}
