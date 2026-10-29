import { useRef, useState } from 'react';
import type { InputDevice, Profile } from '../types';
import { checkProfile, createProfile, exportProfile, importProfiles, missingText, PROFILE_COLORS, REQUIREMENT_TEXT, REQUIREMENTS, type Requirement } from '../lib/profiles';
import { DEFAULT_SETTINGS } from '../lib/curve';
import { CONTROLLER_BY_ID } from '../lib/controllers';
import { isMouseInput, keyName } from '../lib/keys';
import { ControllerGlyph } from './ControllerPicker';
import {
  IconAlert, IconArrowRight, IconCheck, IconCopy, IconDownload, IconEdit, IconGamepad, IconKeyboard, IconMouse, IconPlus,
  IconTrash, IconUpload,
} from './Icons';

export type EditTarget = 'mapping' | 'devices' | 'curve';

interface Props {
  profiles: Profile[];
  activeId: string;
  editingId: string;
  devices: InputDevice[];
  onActivate: (id: string) => void;
  onEdit: (id: string, view: EditTarget) => void;
  onUpsert: (p: Profile) => void;
  onAdd: (list: Profile[], activate?: boolean) => void;
  onDelete: (id: string) => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

const MOUSE_TEXT = { RS: 'Movimiento → stick derecho', LS: 'Movimiento → stick izquierdo', NONE: 'Sin movimiento al stick' } as const;
const REQ_VIEW: Record<Requirement, EditTarget> = { controller: 'devices', keyboard: 'devices', mouse: 'devices', mapping: 'mapping' };
const REQ_ICON: Record<Requirement, JSX.Element> = { controller: <IconGamepad />, keyboard: <IconKeyboard />, mouse: <IconMouse />, mapping: <IconEdit /> };

export default function ProfilesView({ profiles, activeId, editingId, devices, onActivate, onEdit, onUpsert, onAdd, onDelete, toast }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', game: '' });
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deviceRow = (p: Profile, kind: 'keyboard' | 'mouse') => {
    const ids = kind === 'keyboard' ? p.settings.keyboards : p.settings.mice;
    const Icon = kind === 'keyboard' ? IconKeyboard : IconMouse;
    const label = kind === 'keyboard' ? 'Teclado' : 'Ratón';
    if (ids.length === 0) {
      return (
        <button className="pdev missing" onClick={() => onEdit(p.id, 'devices')} id={`profile-${p.id}-pick-${kind}`}>
          <span className="pdev-icon"><Icon /></span>
          <span className="pdev-text"><small>{label} · obligatorio</small><strong>Sin seleccionar</strong></span>
          <span className="pdev-go">Elegir <IconArrowRight /></span>
        </button>
      );
    }
    const dev = devices.find((d) => d.id === ids[0]);
    const offline = !dev && devices.length > 0;
    return (
      <button className={`pdev ok ${offline ? 'warn' : ''}`} onClick={() => onEdit(p.id, 'devices')} title="Cambiar dispositivo">
        <span className="pdev-icon"><Icon /></span>
        <span className="pdev-text">
          <small>{label}</small>
          <strong>{dev?.name ?? 'Dispositivo desconectado'}</strong>
          {dev && <em>{[dev.manufacturer, dev.vid && `VID ${dev.vid}`, dev.connection].filter(Boolean).join(' · ')}</em>}
        </span>
        <span className={`pdev-state ${offline ? 'off' : 'on'}`}>{offline ? 'Desconectado' : <IconCheck />}</span>
      </button>
    );
  };

  const controllerRow = (p: Profile) => {
    const c = p.settings.controller ? CONTROLLER_BY_ID[p.settings.controller] : null;
    if (!c) {
      return (
        <button className="pdev missing" onClick={() => onEdit(p.id, 'devices')} id={`profile-${p.id}-pick-controller`}>
          <span className="pdev-icon"><IconGamepad /></span>
          <span className="pdev-text"><small>Mando a emular · obligatorio</small><strong>Sin elegir</strong></span>
          <span className="pdev-go">Elegir <IconArrowRight /></span>
        </button>
      );
    }
    return (
      <button className="pdev ok pdev-ctrl" onClick={() => onEdit(p.id, 'devices')} title="Cambiar mando" style={{ ['--cc' as string]: c.accent }}>
        <span className="pdev-icon glyph"><ControllerGlyph type={c.id} size={40} /></span>
        <span className="pdev-text"><small>Mando a emular</small><strong>{c.name}</strong><em>{c.protocol}</em></span>
        <span className="pdev-state on"><IconCheck /></span>
      </button>
    );
  };

  /** Solo la cantidad de teclas asignadas (sin detalle del mapeo). */
  const keyCount = (p: Profile) => {
    const list = p.settings.bindings;
    const mouse = list.filter((b) => isMouseInput(b.input)).length;
    const keys = list.length - mouse;
    return (
      <button className={`pkeys ${list.length ? '' : 'empty'}`} onClick={() => onEdit(p.id, 'mapping')} id={`profile-${p.id}-edit-mapping`} title="Editar mapeo">
        <span className="pkeys-num">{list.length}</span>
        <span className="pkeys-text">
          <strong>{list.length === 1 ? 'tecla asignada' : 'teclas asignadas'}</strong>
          <small>{list.length ? `${keys} de teclado · ${mouse} de ratón` : 'Obligatorio · asigna al menos una'}</small>
        </span>
        <span className="pdev-go">{list.length ? 'Editar' : 'Configurar'} <IconArrowRight /></span>
      </button>
    );
  };

  const startEdit = (p: Profile) => { setEditing(p.id); setDraft({ name: p.name, game: p.game }); };
  const saveEdit = (p: Profile) => {
    onUpsert({ ...p, name: draft.name.trim() || p.name, game: draft.game.trim(), updatedAt: Date.now() });
    setEditing(null);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const list = await importProfiles(file);
      onAdd(list, false);
      toast('success', list.length === 1 ? `Perfil «${list[0].name}» importado` : `${list.length} perfiles importados`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const readyCount = profiles.filter((p) => checkProfile(p).complete).length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row-between">
        <div className="stack" style={{ gap: 6, maxWidth: 740 }}>
          <p className="muted" style={{ margin: 0 }}>
            Cada perfil guarda <strong style={{ color: 'var(--text)' }}>todo el setup</strong>: mando a emular, teclado, ratón, teclas asignadas, curva, frecuencia y tecla de pausa.
          </p>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            <IconAlert style={{ width: 14, verticalAlign: '-2px' }} /> Para activar un perfil son <strong className="muted">obligatorios</strong> el mando, un teclado, un ratón y al menos una tecla asignada.
            {' '}{readyCount}/{profiles.length} perfiles listos.
          </p>
        </div>
        <div className="row">
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
          <button id="profile-import" className="btn btn-sm" onClick={() => fileRef.current?.click()}><IconUpload /> Importar</button>
          <button
            id="profile-new"
            className="btn btn-sm btn-primary"
            onClick={() => {
              const p = createProfile(`Perfil ${profiles.length + 1}`, { ...DEFAULT_SETTINGS, keyboards: [], mice: [], controller: null }, { color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] });
              onAdd([p], false);
              startEdit(p);
            }}
          >
            <IconPlus /> Nuevo perfil
          </button>
        </div>
      </div>

      <div className="profile-grid">
        {profiles.map((p) => {
          const active = p.id === activeId;
          const isEditing = p.id === editingId;
          const s = p.settings;
          const c = checkProfile(p, devices);
          return (
            <article key={p.id} id={`profile-${p.id}`} className={`profile-card ${active ? 'active' : ''} ${c.complete ? 'ready' : 'incomplete'}`} style={{ ['--pc' as string]: p.color }}>
              <div className="profile-glow" />
              <header className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ gap: 12, minWidth: 0, flex: 1 }}>
                  <div className="profile-icon"><IconGamepad /></div>
                  {editing === p.id ? (
                    <div className="stack" style={{ gap: 6, flex: 1 }}>
                      <input
                        autoFocus className="input" value={draft.name} maxLength={48} placeholder="Nombre del perfil"
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditing(null); }}
                      />
                      <input
                        className="input" value={draft.game} maxLength={48} placeholder="Juego (opcional)"
                        onChange={(e) => setDraft({ ...draft, game: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditing(null); }}
                      />
                    </div>
                  ) : (
                    <div style={{ minWidth: 0 }}>
                      <h3 className="profile-name" title={p.name}>{p.name}</h3>
                      <span className="faint">{p.game || 'Sin juego asignado'}</span>
                    </div>
                  )}
                </div>
                {active ? <span className="chip ok"><span className="dot" />ACTIVO</span>
                  : c.complete ? <span className="chip">Listo</span>
                    : <span className="chip warn">Incompleto</span>}
              </header>

              {editing === p.id && (
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  {PROFILE_COLORS.map((col) => (
                    <button key={col} aria-label={`Color ${col}`} className={`color-dot ${p.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => onUpsert({ ...p, color: col })} />
                  ))}
                </div>
              )}

              {/* Requisitos obligatorios */}
              <div className="preq">
                <div className="preq-bar"><i style={{ width: `${(c.done / c.total) * 100}%` }} /></div>
                <div className="preq-steps four">
                  {REQUIREMENTS.map((r) => (
                    <button key={r} className={`preq-step ${c[r] ? 'ok' : ''}`} onClick={() => onEdit(p.id, REQ_VIEW[r])} title={REQUIREMENT_TEXT[r].hint}>
                      <span>{c[r] ? <IconCheck /> : REQ_ICON[r]}</span>
                      {REQUIREMENT_TEXT[r].title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="psection">
                <div className="psection-head"><span>Mando y dispositivos</span></div>
                <div className="pdevs">
                  {controllerRow(p)}
                  {deviceRow(p, 'keyboard')}
                  {deviceRow(p, 'mouse')}
                </div>
              </div>

              <div className="psection">
                <div className="psection-head"><span>Mapeo</span></div>
                {keyCount(p)}
                <div className="pmeta">
                  <span><IconMouse /> {MOUSE_TEXT[s.mouseTarget]}</span>
                  <span>Sens. {s.config.sensitivity.toFixed(2)}×</span>
                  <span>{s.pollingHz} Hz</span>
                  <span>Pausa: {keyName(s.pauseHotkey)}</span>
                </div>
              </div>

              <footer className="profile-actions">
                {editing === p.id ? (
                  <button className="btn btn-sm btn-primary" onClick={() => saveEdit(p)}><IconCheck /> Guardar</button>
                ) : active ? (
                  <button className="btn btn-sm" disabled><IconCheck /> En uso</button>
                ) : (
                  <button
                    id={`profile-activate-${p.id}`}
                    className={`btn btn-sm ${c.complete ? 'btn-primary' : ''}`}
                    disabled={!c.complete}
                    title={c.complete ? 'Usar este perfil' : missingText(c)}
                    onClick={() => onActivate(p.id)}
                  >
                    {c.complete ? 'Activar' : <><IconAlert /> {c.done}/{c.total} requisitos</>}
                  </button>
                )}
                {isEditing && !active && <span className="chip sm">Editando</span>}
                <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                  <button className="btn btn-sm btn-ghost" title="Renombrar" aria-label="Renombrar" onClick={() => startEdit(p)}><IconEdit /></button>
                  <button
                    className="btn btn-sm btn-ghost" title="Duplicar" aria-label="Duplicar"
                    onClick={() => onAdd([createProfile(`${p.name} (copia)`, p.settings, { game: p.game, color: p.color })], false)}
                  >
                    <IconCopy />
                  </button>
                  <button className="btn btn-sm btn-ghost" title="Exportar a archivo" aria-label="Exportar" onClick={() => exportProfile(p)}><IconDownload /></button>
                  {confirmDel === p.id ? (
                    <button className="btn btn-sm btn-danger" onClick={() => { onDelete(p.id); setConfirmDel(null); }} onBlur={() => setConfirmDel(null)} autoFocus>¿Eliminar?</button>
                  ) : (
                    <button className="btn btn-sm btn-ghost" title="Eliminar" aria-label="Eliminar" disabled={profiles.length <= 1 || active} onClick={() => setConfirmDel(p.id)}><IconTrash /></button>
                  )}
                </div>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
