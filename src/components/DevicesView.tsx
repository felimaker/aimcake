import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceActivity, DeviceKind, EngineSettings, InputDevice } from '../types';
import { keyName } from '../lib/keys';
import { CONTROLLER_BY_ID } from '../lib/controllers';
import { bridge } from '../services/tauriBridge';
import ControllerPicker from './ControllerPicker';
import { IconAlert, IconCheck, IconGamepad, IconKeyboard, IconMouse, IconRadar, IconRefresh } from './Icons';

interface Props {
  settings: EngineSettings;
  onChange: (s: EngineSettings) => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

interface Activity { at: number; vk: number | null; count: number }

const KIND_TEXT: Record<DeviceKind, { plural: string; one: string; key: 'keyboards' | 'mice' }> = {
  keyboard: { plural: 'Teclados', one: 'teclado', key: 'keyboards' },
  mouse: { plural: 'Ratones', one: 'ratón', key: 'mice' },
};

function DeviceGlyph({ kind, active }: { kind: DeviceKind; active: boolean }) {
  return (
    <div className={`dev-glyph ${active ? 'active' : ''}`}>
      {kind === 'keyboard' ? <IconKeyboard /> : <IconMouse />}
    </div>
  );
}

export default function DevicesView({ settings, onChange, toast }: Props) {
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [detecting, setDetecting] = useState<DeviceKind | null>(null);
  const [, force] = useState(0);
  const detectRef = useRef<DeviceKind | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDevices(await bridge.listDevices());
    } catch (e) {
      toast('error', `No se pudieron listar los dispositivos: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    const offs = [
      bridge.onDevicesChanged(() => refresh()),
      bridge.onDeviceActivity((a: DeviceActivity) => {
        setActivity((prev) => ({ ...prev, [a.id]: { at: Date.now(), vk: a.vk ?? prev[a.id]?.vk ?? null, count: (prev[a.id]?.count ?? 0) + 1 } }));
        if (detectRef.current === a.kind) {
          detectRef.current = null;
          setDetecting(null);
          const key = KIND_TEXT[a.kind].key;
          onChangeRef.current({ ...settingsRef.current, [key]: [a.id] });
          const dev = devicesRef.current.find((d) => d.id === a.id);
          toast('success', `${a.kind === 'keyboard' ? 'Teclado' : 'Ratón'} detectado: ${dev?.name ?? a.id}`);
        }
      }),
    ];
    // Reloj para apagar los LEDs de actividad.
    const t = window.setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(t); offs.forEach((p) => p.then((off) => off())); };
  }, [refresh, toast]);

  const startDetect = (kind: DeviceKind) => {
    const next = detecting === kind ? null : kind;
    detectRef.current = next;
    setDetecting(next);
  };

  const now = Date.now();

  const column = (kind: DeviceKind) => {
    const meta = KIND_TEXT[kind];
    const chosen = settings[meta.key];
    const list = devices.filter((d) => d.kind === kind);
    // Dispositivo seleccionado que ahora mismo no está conectado.
    const missing = chosen.filter((id) => !list.some((d) => d.id === id));
    const setChosen = (ids: string[]) => onChange({ ...settings, [meta.key]: ids });
    // Selección única: elegir otro dispositivo sustituye al actual.
    const pick = (id: string) => { if (!chosen.includes(id)) setChosen([id]); };

    return (
      <section className="card dev-column" key={kind}>
        <div className="card-title">
          <span className="row">{kind === 'keyboard' ? <IconKeyboard style={{ width: 16 }} /> : <IconMouse style={{ width: 16 }} />} {meta.plural} · {list.length}{chosen.length > 0 ? <span className="chip ok sm" style={{ marginLeft: 6 }}><IconCheck /> Elegido</span> : <span className="chip warn sm" style={{ marginLeft: 6 }}>Elige 1</span>}</span>
          <button id={`detect-${kind}`} className={`btn btn-sm ${detecting === kind ? 'btn-primary detecting' : ''}`} onClick={() => startDetect(kind)}>
            <IconRadar /> {detecting === kind ? (kind === 'keyboard' ? 'Pulsa una tecla…' : 'Mueve el ratón…') : 'Detectar'}
          </button>
        </div>

        {detecting === kind && (
          <div className="alert info" style={{ marginBottom: 12 }}>
            <IconRadar />
            <span>{kind === 'keyboard' ? 'Pulsa cualquier tecla en el teclado que quieres usar.' : 'Mueve o haz clic con el ratón que quieres usar.'} Se seleccionará automáticamente.</span>
          </div>
        )}

        {chosen.length === 0 && detecting !== kind && (
          <div className="alert warn-alert" style={{ marginBottom: 12 }}>
            <IconAlert />
            <span><strong>Obligatorio:</strong> elige <strong>un</strong> {meta.one} de la lista para poder activar este perfil. Usa «Detectar» si no sabes cuál es.</span>
          </div>
        )}

        <div className="dev-list" role="radiogroup" aria-label={`${meta.plural} disponibles`}>

          {list.map((d) => {
            const act = activity[d.id];
            const hot = !!act && now - act.at < 450;
            const on = chosen.includes(d.id);
            return (
              <button key={d.id} id={`dev-${d.id.replace(/[^a-z0-9]/gi, '-')}`} role="radio" aria-checked={on} className={`dev-item ${on ? 'chosen' : ''} ${hot ? 'hot' : ''}`} onClick={() => pick(d.id)}>
                <DeviceGlyph kind={kind} active={hot} />
                <div className="dev-info">
                  <strong title={d.name}>{d.name}</strong>
                  <span>
                    {d.manufacturer ?? 'Fabricante desconocido'}
                    {d.vid && d.pid && <> · <code>VID {d.vid} · PID {d.pid}</code></>}
                  </span>
                  <span className="dev-tags">
                    <em>{d.connection}</em>
                    {d.interfaces > 1 && <em>{d.interfaces} interfaces</em>}
                    {act && (
                      <em className={`act ${hot ? 'hot' : ''}`}>
                        <i className="led" />
                        {act.vk != null ? `Última: ${keyName(act.vk)}` : 'Movimiento'}
                      </em>
                    )}
                  </span>
                </div>
                <span className={`dev-check radio ${on ? 'on' : ''}`}><IconCheck /></span>
              </button>
            );
          })}

          {missing.map((id) => (
            <div key={id} className="dev-item missing chosen">
              <div className="dev-glyph">{kind === 'keyboard' ? <IconKeyboard /> : <IconMouse />}</div>
              <div className="dev-info">
                <strong>Desconectado</strong>
                <span><code>{id}</code></span>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setChosen(chosen.filter((x) => x !== id))}>Quitar</button>
            </div>
          ))}

          {!loading && list.length === 0 && <p className="faint">No se encontró ningún {kind === 'keyboard' ? 'teclado' : 'ratón'}.</p>}
        </div>
      </section>
    );
  };

  const ctrl = settings.controller ? CONTROLLER_BY_ID[settings.controller] : null;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card" id="controller-card">
        <div className="card-title">
          <span className="row"><IconGamepad style={{ width: 16 }} /> Mando a emular
            {ctrl ? <span className="chip ok sm" style={{ marginLeft: 6 }}><IconCheck /> {ctrl.name}</span> : <span className="chip warn sm" style={{ marginLeft: 6 }}>Elige 1</span>}
          </span>
          <span className="faint" style={{ fontSize: 12.5 }}>Es lo que verá Windows y el juego</span>
        </div>
        <ControllerPicker value={settings.controller} onChange={(controller) => onChange({ ...settings, controller })} />
        {ctrl?.note && <p className="faint cpick-note"><IconAlert /> {ctrl.note}</p>}
      </section>

      <div className="row-between">
        <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
          Selecciona <strong style={{ color: 'var(--text)' }}>exactamente un teclado y un ratón exclusivos</strong>. 
          Solo estos dos dispositivos controlarán el mando emulado; cualquier otro teclado o ratón secundario conectado a la PC seguirá funcionando de forma independiente en Windows sin interferir en el juego.
        </p>
        <button id="devices-refresh" className="btn btn-sm" onClick={refresh} disabled={loading}>
          {loading ? <span className="spinner" /> : <IconRefresh />} Actualizar lista
        </button>
      </div>
      <div className="grid grid-2">
        {column('keyboard')}
        {column('mouse')}
      </div>
      <div className="alert info">
        <IconAlert />
        <span>
          <strong>Aislamiento estricto activado:</strong> La emulación solo responderá a las entradas del ratón y teclado elegidos arriba.
          El monitor en vivo en la bandeja del sistema (junto al reloj de Windows) te indicará en todo momento si el sistema está activo o en pausa.
        </span>
      </div>
    </div>
  );
}
