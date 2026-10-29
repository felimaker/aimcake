import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ControllerType, EngineStatus, InputDevice, Profile } from '../types';
import { checkProfile, missingText } from '../lib/profiles';
import { CONTROLLER_BY_ID } from '../lib/controllers';
import { isMouseInput } from '../lib/keys';
import { bridge } from '../services/tauriBridge';
import ControllerPicker from './ControllerPicker';
import {
  IconAlert, IconArrowRight, IconCheck, IconChevron, IconChip, IconDownload, IconGamepad, IconKeyboard, IconLayers, IconMouse,
  IconRadar, IconRefresh, IconShield,
} from './Icons';

export type StepId = 'driver' | 'controller' | 'devices' | 'profile';
type GoView = 'devices' | 'mapping' | 'profiles';

interface Props {
  status: EngineStatus | null;
  profile: Profile;
  devices: InputDevice[];
  onRefreshStatus: () => Promise<void>;
  onSetController: (c: ControllerType) => void;
  onGo: (view: GoView) => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

const COLLAPSE_KEY = 'xcb.checklist.collapsed';

/* ------------------------------------------------------------------ */
/* Piezas visuales de la guía                                           */
/* ------------------------------------------------------------------ */
function Flow({ children }: { children: ReactNode }) {
  return <div className="gflow">{children}</div>;
}
function Frame({ n, caption, children, done }: { n: number; caption: string; children: ReactNode; done?: boolean }) {
  return (
    <figure className={`gframe ${done ? 'done' : ''}`}>
      <span className="gframe-n">{done ? <IconCheck /> : n}</span>
      <div className="gframe-body">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
function Faq({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="faq">
      <div className="faq-title">Preguntas frecuentes</div>
      {items.map(([q, a], i) => (
        <details key={i} className="faq-item">
          <summary><span>{q}</span><IconChevron /></summary>
          <div className="faq-a">{a}</div>
        </details>
      ))}
    </div>
  );
}
function HowTo({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="howto">
      {steps.map((s, i) => <li key={i}><span>{i + 1}</span><p>{s}</p></li>)}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist                                                            */
/* ------------------------------------------------------------------ */
export default function SetupChecklist({ status, profile, devices, onRefreshStatus, onSetController, onGo, toast }: Props) {
  const check = checkProfile(profile, devices);
  const s = profile.settings;
  const kb = devices.find((d) => d.id === s.keyboards[0]);
  const ms = devices.find((d) => d.id === s.mice[0]);
  const keyCount = s.bindings.length;
  const mouseKeys = s.bindings.filter((b) => isMouseInput(b.input)).length;

  const done: Record<StepId, boolean> = {
    driver: !!status?.driverOk,
    controller: check.controller,
    devices: check.keyboard && check.mouse,
    profile: check.complete,
  };
  const order: StepId[] = ['driver', 'controller', 'devices', 'profile'];
  const doneCount = order.filter((k) => done[k]).length;
  const allDone = doneCount === order.length;
  const firstPending = order.find((k) => !done[k]) ?? 'driver';

  const [selected, setSelected] = useState<StepId>(firstPending);
  const [userPicked, setUserPicked] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installNote, setInstallNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  // Avanza solo al siguiente paso pendiente mientras el usuario no elija otro.
  useEffect(() => { if (!userPicked) setSelected(firstPending); }, [firstPending, userPicked]);
  useEffect(() => { if (!allDone) setCollapsed(false); }, [allDone]);

  const pick = (id: StepId) => { setSelected(id); setUserPicked(true); };
  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
  };

  const recheck = async () => {
    setChecking(true);
    try { await onRefreshStatus(); } finally { setChecking(false); }
  };

  const install = async () => {
    setInstalling(true);
    setInstallNote(null);
    try {
      const r = await bridge.installDriver();
      await onRefreshStatus();
      if (r.cancelled) setInstallNote({ kind: 'warn', text: 'Cancelaste el instalador. Puedes volver a abrirlo cuando quieras.' });
      else if (r.rebootRequired) setInstallNote({ kind: 'warn', text: 'Driver instalado. Windows pide reiniciar el equipo para terminar: reinicia y vuelve a abrir la app.' });
      else if (r.driverOk) { setInstallNote({ kind: 'ok', text: 'Drivers de AimCake instalados y funcionando.' }); toast('success', 'Drivers de AimCake instalados'); setUserPicked(false); }
      else setInstallNote({ kind: 'error', text: `El instalador terminó (código ${r.exitCode}) pero el driver aún no responde. Pulsa «Comprobar de nuevo» o reinicia el equipo.` });
    } catch (e) {
      setInstallNote({ kind: 'error', text: String((e as Error)?.message ?? e) });
    } finally {
      setInstalling(false);
    }
  };

  const STEPS: Record<StepId, { n: number; title: string; icon: ReactNode; okText: string; pendingText: string }> = useMemo(() => ({
    driver: {
      n: 1, title: 'Drivers de AimCake instalados', icon: <IconChip />,
      okText: 'Instalados y respondiendo', pendingText: status ? 'No encontrados: hay que instalarlos' : 'Comprobando…',
    },
    controller: {
      n: 2, title: 'Mando seleccionado', icon: <IconGamepad />,
      okText: s.controller ? `Se emulará un ${CONTROLLER_BY_ID[s.controller].name}` : '', pendingText: 'Elige qué mando quieres emular',
    },
    devices: {
      n: 3, title: 'Teclado y ratón seleccionados', icon: <IconKeyboard />,
      okText: `${kb?.name ?? 'Teclado elegido'} · ${ms?.name ?? 'ratón elegido'}`,
      pendingText: !check.keyboard && !check.mouse ? 'Falta elegir teclado y ratón' : !check.keyboard ? 'Falta elegir el teclado' : 'Falta elegir el ratón',
    },
    profile: {
      n: 4, title: 'Perfil configurado', icon: <IconLayers />,
      okText: `«${profile.name}» · ${keyCount} ${keyCount === 1 ? 'tecla asignada' : 'teclas asignadas'}`,
      pendingText: check.complete ? '' : missingText(check),
    },
  }), [status, s.controller, kb, ms, check, profile.name, keyCount]);

  /* ---------------- Contenido de ayuda por paso ---------------- */
  const help: Record<StepId, ReactNode> = {
    driver: (
      <>
        <p className="help-lead">
          Los <strong>drivers de AimCake</strong> permiten que Windows reconozca el mando virtual para activar el Aim Assist nativo jugando con tu ratón y teclado.
          Puedes instalarlos con un solo clic o descargando el archivo <code>aimcake_drivers.exe</code>.
        </p>
        <Flow>
          <Frame n={1} caption="Pulsa «Instalar drivers»">
            <div className="mk-btn primary"><IconDownload /> Instalar drivers de AimCake</div>
          </Frame>
          <Frame n={2} caption="Windows pregunta: pulsa «Sí»">
            <div className="mk-uac">
              <div className="mk-uac-head"><IconShield /> Control de cuentas de usuario</div>
              <small>¿Permitir que esta app haga cambios?</small>
              <div className="mk-uac-btns"><span className="mk-btn sm primary">Sí</span><span className="mk-btn sm">No</span></div>
            </div>
          </Frame>
          <Frame n={3} caption="En el asistente: «Instalar» y «Finalizar»">
            <div className="mk-win">
              <div className="mk-win-bar"><i /><i /><i /> AimCake Drivers Setup</div>
              <div className="mk-win-body">
                <div className="mk-progress"><i /></div>
                <div className="mk-win-btns"><span className="mk-btn sm primary">Instalar</span></div>
              </div>
            </div>
          </Frame>
          <Frame n={4} caption="Vuelve aquí: el paso se pone verde" done={done.driver}>
            <div className="mk-status"><span className="mk-dot ok" /> Instalado</div>
          </Frame>
        </Flow>
        <HowTo steps={[
          <>Pulsa <strong>Instalar drivers de AimCake</strong> aquí abajo o descarga y abre <code>aimcake_drivers.exe</code>.</>,
          <>Si Windows muestra el aviso de <strong>Control de cuentas de usuario</strong>, pulsa <strong>Sí</strong>.</>,
          <>En el asistente pulsa <strong>Instalar</strong> y al terminar <strong>Finalizar</strong>. Tarda menos de 30 segundos.</>,
          <>Al terminar, el sistema detecta los drivers automáticamente y este paso se marcará en verde.</>,
        ]} />
        {installNote && (
          <div className={`alert ${installNote.kind === 'ok' ? 'info' : installNote.kind === 'warn' ? 'warn-alert' : 'error'}`}>
            {installNote.kind === 'ok' ? <IconCheck /> : <IconAlert />}<span>{installNote.text}</span>
          </div>
        )}
        <div className="help-actions">
          {!done.driver && (status?.driverInstaller ?? true) && (
            <button id="driver-install" className="btn btn-primary" onClick={install} disabled={installing}>
              {installing ? <><span className="spinner" /> Instalando drivers de AimCake…</> : <><IconDownload /> Instalar drivers de AimCake</>}
            </button>
          )}
          <button id="driver-recheck" className="btn" onClick={recheck} disabled={checking || installing}>
            {checking ? <span className="spinner" /> : <IconRefresh />} Comprobar de nuevo
          </button>
          <a
            id="driver-download"
            className="btn btn-ghost"
            href="/downloads/aimcake_drivers.exe"
            download="aimcake_drivers.exe"
            title="Descarga el archivo instalador de drivers"
          >
            <IconDownload /> Descargar aimcake_drivers.exe
          </a>
        </div>
        <Faq items={[
          ['¿Por qué son necesarios los drivers de AimCake?', <>Son los componentes necesarios para que Windows active la emulación del mando y los juegos reconozcan la asistencia de apuntado (Aim Assist) mientras juegas con ratón y teclado.</>],
          ['¿Es seguro el archivo aimcake_drivers.exe?', <>Completamente seguro y verificado para Windows 10 y Windows 11. No instala publicidad ni modifica tus archivos personales.</>],
          ['¿Tengo que reiniciar mi PC?', <>Casi nunca es necesario reiniciar. El instalador termina en pocos segundos y queda activo de inmediato.</>],
          ['Lo instalé pero sigue saliendo «No encontrado»', <>Pulsa <strong>Comprobar de nuevo</strong>. Si es la primera vez que lo instalas, en casos excepcionales Windows puede requerir un reinicio para iniciar el servicio.</>],
          ['¿Afecta a mis periféricos o a otros juegos?', <>No. Tus ratones, teclados y mandos físicos continúan funcionando con normalidad.</>],
        ]} />
      </>
    ),
    controller: (
      <>
        <p className="help-lead">
          Elige qué mando verá Windows. Para casi todos los juegos de PC el mejor es <strong>Xbox 360</strong>. Se guarda en el perfil <strong>«{profile.name}»</strong>.
        </p>
        <ControllerPicker compact value={s.controller} onChange={(c) => { onSetController(c); toast('success', `Mando: ${CONTROLLER_BY_ID[c].name}`); }} />
        {s.controller && CONTROLLER_BY_ID[s.controller].note && <p className="faint cpick-note"><IconAlert /> {CONTROLLER_BY_ID[s.controller].note}</p>}
        <HowTo steps={[
          <>Haz clic en una de las tres tarjetas de arriba. Se guarda al instante.</>,
          <>Si no sabes cuál elegir, usa <strong>Xbox 360</strong>: es el que reconoce casi cualquier juego sin configurar nada.</>,
          <>Elige <strong>DualShock 4</strong> solo si el juego necesita un mando de PlayStation o quieres ver sus iconos (✕ ○ □ △).</>,
        ]} />
        <Faq items={[
          ['¿Cuál me conviene?', <><strong>Xbox 360</strong> para Call of Duty, Fortnite, Apex, juegos de Steam o Game Pass. <strong>DualShock 4</strong> si el juego solo admite PlayStation. <strong>Xbox One / Series</strong> funciona igual que el de 360.</>],
          ['¿Qué diferencia hay entre Xbox 360 y Xbox One?', <>Para los juegos de Windows, ninguna: los dos usan el mismo sistema (XInput) y tienen los mismos botones. AimCake emula los dos con total compatibilidad.</>],
          ['El juego no reconoce el DualShock 4', <>Muchos juegos de PC solo leen mandos Xbox. Cambia a <strong>Xbox 360</strong>, o activa <em>Steam Input</em> para PlayStation si el juego está en Steam.</>],
          ['¿Puedo cambiarlo con el emulador encendido?', <>Sí, pero el cambio se aplica la próxima vez que pulses <strong>Iniciar</strong>. Detén el emulador y vuelve a iniciarlo.</>],
          ['¿Puedo tener un mando distinto en cada perfil?', <>Sí. Cada perfil guarda su propio mando, por ejemplo Xbox 360 para un shooter y DualShock 4 para otro juego.</>],
        ]} />
      </>
    ),
    devices: (
      <>
        <p className="help-lead">
          Elige <strong>un teclado</strong> y <strong>un ratón</strong> de la lista. Solo esos dos controlan el mando; el resto de dispositivos siguen funcionando con normalidad.
        </p>
        <div className="help-devs">
          <div className={`help-dev ${check.keyboard ? 'ok' : ''}`}><IconKeyboard /><span><small>Teclado</small><strong>{check.keyboard ? (kb?.name ?? 'Elegido (desconectado)') : 'Sin elegir'}</strong></span>{check.keyboard ? <IconCheck /> : <IconAlert />}</div>
          <div className={`help-dev ${check.mouse ? 'ok' : ''}`}><IconMouse /><span><small>Ratón</small><strong>{check.mouse ? (ms?.name ?? 'Elegido (desconectado)') : 'Sin elegir'}</strong></span>{check.mouse ? <IconCheck /> : <IconAlert />}</div>
        </div>
        <Flow>
          <Frame n={1} caption="Abre Dispositivos">
            <div className="mk-nav"><span>Panel</span><span className="on">Dispositivos</span><span>Licencia</span></div>
          </Frame>
          <Frame n={2} caption="«Detectar» del teclado y pulsa una tecla">
            <div className="mk-row"><span className="mk-btn sm primary pulse"><IconRadar /> Pulsa una tecla…</span><kbd className="mk-key press">W</kbd></div>
          </Frame>
          <Frame n={3} caption="«Detectar» del ratón y muévelo">
            <div className="mk-row"><span className="mk-btn sm primary pulse"><IconRadar /> Mueve el ratón…</span><span className="mk-mouse"><IconMouse /></span></div>
          </Frame>
          <Frame n={4} caption="Quedan marcados con ✓" done={done.devices}>
            <div className="mk-list"><span><i className="mk-radio on" /> G815 RGB</span><span><i className="mk-radio on" /> PRO X SUPERLIGHT</span></div>
          </Frame>
        </Flow>
        <HowTo steps={[
          <>Pulsa <strong>Ir a Dispositivos</strong>.</>,
          <>En la columna <strong>Teclados</strong> pulsa <strong>Detectar</strong> y luego cualquier tecla del teclado que vas a usar. Se marca solo.</>,
          <>En la columna <strong>Ratones</strong> pulsa <strong>Detectar</strong> y mueve o haz clic con tu ratón.</>,
          <>También puedes hacer clic directamente en un dispositivo de la lista. Elegir otro sustituye al anterior.</>,
        ]} />
        <div className="help-actions">
          <button id="go-devices" className="btn btn-primary" onClick={() => onGo('devices')}>Ir a Dispositivos <IconArrowRight /></button>
        </div>
        <Faq items={[
          ['¿Por qué solo puedo elegir un teclado y un ratón?', <>Así el mando responde solo a tus dispositivos de juego y no a otros (por ejemplo, el teclado del portátil o un segundo ratón). Si cambias de teclado, elige el nuevo en el mismo perfil o crea otro perfil.</>],
          ['No sé cuál de la lista es mi teclado o ratón', <>Usa <strong>Detectar</strong>, o simplemente pulsa una tecla o mueve el ratón: el dispositivo que uses enciende su <strong>luz de actividad</strong> verde en la lista.</>],
          ['Mi teclado inalámbrico aparece con otro nombre', <>Los receptores USB (Logitech Lightspeed/Unifying, Razer HyperSpeed…) a veces aparecen con el nombre del receptor. Detectar lo identifica igualmente.</>],
          ['Aparece como «Desconectado»', <>El dispositivo elegido no está conectado ahora mismo. Conéctalo, o elige otro de la lista.</>],
          ['¿Puedo seguir usando el teclado para escribir?', <>Sí. Solo las teclas que asignes al mando se convierten en botones. Si activas «Bloquear teclas mapeadas», esas teclas dejan de llegar al juego como teclado.</>],
        ]} />
      </>
    ),
    profile: (
      <>
        <p className="help-lead">
          El perfil guarda todo tu setup. Para activarlo necesita el mando, el teclado, el ratón y <strong>al menos una tecla asignada</strong> a un botón del mando.
        </p>
        <div className="help-profile" style={{ ['--pc' as string]: profile.color }}>
          <span className="pswitch-dot" />
          <span><small>Perfil activo</small><strong>{profile.name}</strong></span>
          <span className="help-profile-keys"><b>{keyCount}</b> {keyCount === 1 ? 'tecla' : 'teclas'}<small>{keyCount - mouseKeys} teclado · {mouseKeys} ratón</small></span>
          <span className={`chip ${check.complete ? 'ok' : 'warn'}`}>{check.done}/{check.total}</span>
        </div>
        <Flow>
          <Frame n={1} caption="En Mapeo, elige un botón del mando">
            <div className="mk-pad"><span className="mk-face a sel">A</span><span className="mk-face b">B</span><span className="mk-face x">X</span><span className="mk-face y">Y</span></div>
          </Frame>
          <Frame n={2} caption="Pulsa la tecla que quieres usar">
            <div className="mk-row"><kbd className="mk-key wide press">Espacio</kbd></div>
          </Frame>
          <Frame n={3} caption="Queda asignada">
            <div className="mk-row"><span className="mk-face a">A</span><IconArrowRight /><kbd className="mk-key wide">Espacio</kbd></div>
          </Frame>
          <Frame n={4} caption="Perfil listo: pulsa Iniciar" done={done.profile}>
            <div className="mk-status"><span className="mk-dot ok" /> Listo · {keyCount} teclas</div>
          </Frame>
        </Flow>
        <HowTo steps={[
          <>Pulsa <strong>Ir a Mapeo</strong>. Verás un mando: haz clic en el botón que quieres configurar (A, gatillo RT, stick…).</>,
          <>Pulsa en tu teclado o ratón la tecla que hará de ese botón. Repite con los demás botones.</>,
          <>Los perfiles de ejemplo ya traen teclas asignadas; puedes cambiarlas cuando quieras.</>,
          <>Con los 4 pasos en verde, pulsa el botón <strong>Iniciar</strong> del panel.</>,
        ]} />
        <div className="help-actions">
          <button id="go-mapping" className="btn btn-primary" onClick={() => onGo('mapping')}>Ir a Mapeo <IconArrowRight /></button>
          <button id="go-profiles" className="btn" onClick={() => onGo('profiles')}><IconLayers /> Ver perfiles</button>
        </div>
        <Faq items={[
          ['¿Qué es un perfil?', <>Es un setup guardado: mando a emular, teclado, ratón, teclas asignadas, sensibilidad del ratón y tecla de pausa. Puedes tener uno por juego y cambiar entre ellos desde la barra lateral.</>],
          ['¿Por qué no puedo activar un perfil?', <>Le falta algo obligatorio. La tarjeta del perfil muestra qué falta (Mando, Teclado, Ratón o Mapeo); haz clic en el paso en rojo y te lleva a configurarlo.</>],
          ['¿Cómo hago que el ratón mueva la cámara?', <>En <strong>Mapeo → Opciones del perfil</strong>, en «Movimiento del ratón controla» elige «Stick der.». Ajusta la sensibilidad en <strong>Curva</strong>.</>],
          ['¿Cómo pauso el mando sin cerrarlo?', <>Pulsa la tecla de pausa (por defecto <strong>F8</strong>). El mando sigue conectado pero deja de enviar botones, útil para escribir en el chat.</>],
          ['¿Puedo copiar un perfil a otro PC?', <>Sí: en <strong>Perfiles</strong> usa «Exportar» y en el otro PC «Importar». Tendrás que volver a elegir el teclado y el ratón de ese equipo.</>],
        ]} />
      </>
    ),
  };

  /* ---------------- Vista compacta cuando todo está listo ---------------- */
  if (allDone && collapsed) {
    return (
      <section className="card setup setup-done" id="setup-checklist">
        <div className="setup-done-row">
          <span className="setup-done-icon"><IconCheck /></span>
          <div>
            <strong>Todo listo para jugar</strong>
            <small>Driver instalado · {CONTROLLER_BY_ID[s.controller!].name} · teclado y ratón elegidos · {keyCount} teclas asignadas</small>
          </div>
          <div className="setup-done-steps">{order.map((k) => <i key={k} />)}</div>
          <button id="setup-expand" className="btn btn-sm btn-ghost" onClick={toggleCollapse}>Ver guía <IconChevron /></button>
        </div>
      </section>
    );
  }

  const cur = STEPS[selected];

  return (
    <section className={`card setup ${allDone ? 'all-done' : ''}`} id="setup-checklist">
      <div className="setup-head">
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}><span>Puesta en marcha</span></div>
          <h2 className="setup-title">{allDone ? 'Todo listo para jugar' : `Completa ${order.length - doneCount} ${order.length - doneCount === 1 ? 'paso más' : 'pasos más'} para empezar`}</h2>
        </div>
        <div className="setup-progress">
          <svg viewBox="0 0 44 44" className="setup-ring">
            <circle cx="22" cy="22" r="18" className="track" />
            <circle cx="22" cy="22" r="18" className="fill" style={{ strokeDasharray: `${(doneCount / order.length) * 113.1} 113.1` }} />
          </svg>
          <span><b>{doneCount}</b>/{order.length}</span>
          {allDone && <button id="setup-collapse" className="btn btn-sm btn-ghost" onClick={toggleCollapse}>Ocultar</button>}
        </div>
      </div>

      <div className="setup-body">
        <ol className="setup-steps">
          {order.map((id) => {
            const st = STEPS[id];
            const ok = done[id];
            return (
              <li key={id}>
                <button id={`setup-step-${id}`} className={`setup-step ${ok ? 'ok' : 'pending'} ${selected === id ? 'sel' : ''}`} onClick={() => pick(id)} aria-current={selected === id}>
                  <span className="setup-num">{ok ? <IconCheck /> : st.n}</span>
                  <span className="setup-step-text">
                    <strong>{st.title}</strong>
                    <small>{ok ? st.okText : st.pendingText}</small>
                  </span>
                  <span className="setup-step-icon">{st.icon}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="setup-help" key={selected}>
          <div className="setup-help-head">
            <span className={`setup-num big ${done[selected] ? 'ok' : ''}`}>{done[selected] ? <IconCheck /> : cur.n}</span>
            <div>
              <small>Paso {cur.n} de {order.length} · {done[selected] ? 'Completado' : 'Pendiente'}</small>
              <h3>{cur.title}</h3>
            </div>
          </div>
          {help[selected]}
        </div>
      </div>
    </section>
  );
}
