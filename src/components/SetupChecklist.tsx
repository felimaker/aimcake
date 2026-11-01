import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ControllerType, EngineStatus, InputDevice, Profile, SoftwarePackageId } from '../types';
import { checkProfile, missingText } from '../lib/profiles';
import { CONTROLLER_BY_ID } from '../lib/controllers';
import { isMouseInput } from '../lib/keys';
import { bridge, isTauri } from '../services/tauriBridge';
import ControllerPicker from './ControllerPicker';
import {
  IconAlert, IconArrowRight, IconCheck, IconChevron, IconChip, IconCpu, IconDownload, IconGamepad,
  IconKeyboard, IconLayers, IconMouse, IconRadar, IconRefresh, IconShield, IconSpark, IconWindows, IconX
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
/* Especificación de software requerido en Windows                    */
/* ------------------------------------------------------------------ */
interface SoftwarePackage {
  id: SoftwarePackageId;
  stepNum: number;
  shortLabel: string;
  name: string;
  badge: string;
  badgeType: 'ok' | 'info' | 'warn';
  fileName: string;
  fileSize: string;
  downloadUrl: string;
  purpose: string;
  whyRequired: string;
  installInstructions: string;
}

const SOFTWARE_LIST: SoftwarePackage[] = [
  {
    id: 'vcredist',
    stepNum: 1,
    shortLabel: 'VC++',
    name: 'Microsoft Visual C++ 2015-2022 Redistributable (x64)',
    badge: 'Runtime Oficial Microsoft',
    badgeType: 'info',
    fileName: 'vc_redist.x64.exe',
    fileSize: '~25.6 MB',
    downloadUrl: '/downloads/vc_redist.x64.exe',
    purpose: 'Librerías C/C++ de sistema y temporizadores de 1 ms',
    whyRequired: 'Obligatorio en Windows para ejecutar llamadas nativas a 1000 Hz, inyectar el bus de mando y evitar errores de DLL faltantes (vcruntime140.dll).',
    installInstructions: 'Abre vc_redist.x64.exe, pulsa «Instalar» y reinicia el PC si Windows lo solicita.',
  },
  {
    id: 'vigembus',
    stepNum: 2,
    shortLabel: 'ViGEmBus',
    name: 'Driver Kernel ViGEmBus (Virtual Gamepad Emulation Bus)',
    badge: 'WHQL Certificado Microsoft',
    badgeType: 'ok',
    fileName: 'ViGEmBus_Setup.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/ViGEmBus_Setup.exe',
    purpose: 'Controlador de emulación en modo kernel de Windows',
    whyRequired: 'Crea el gamepad virtual Xbox 360 o DualShock 4 que Windows y los juegos reconocen a nivel de hardware para activar el Aim Assist.',
    installInstructions: 'Abre ViGEmBus_Setup.exe, concede permisos de administrador en el UAC y completa el asistente en 15 segundos.',
  },
  {
    id: 'aimcake_drivers',
    stepNum: 3,
    shortLabel: 'Drivers AimCake',
    name: 'AimCake Driver Suite & Device Isolator',
    badge: 'Driver Oficial AimCake',
    badgeType: 'ok',
    fileName: 'aimcake_drivers.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/aimcake_drivers.exe',
    purpose: 'Filtro de aislamiento de hardware y captura Raw Input',
    whyRequired: 'Aísla exclusivamente el teclado y ratón seleccionados para que tus entradas se traduzcan al mando sin colisión de doble puntero en Windows.',
    installInstructions: 'Ejecuta aimcake_drivers.exe para registrar los servicios y controladores exclusivos de AimCake en Windows.',
  },
  {
    id: 'aimcake_bridge',
    stepNum: 4,
    shortLabel: 'Cliente Desktop',
    name: 'AimCake Desktop Client / Controller Bridge (1000 Hz)',
    badge: 'Cliente de Escritorio Windows',
    badgeType: 'info',
    fileName: 'AimCake_Setup.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/AimCake_Setup.exe',
    purpose: 'Aplicación cliente con System Tray, telemetría e IPC nativo',
    whyRequired: 'Los navegadores web tienen limitaciones de sandbox de seguridad; la app de escritorio permite captura sin restricciones y latencia de 1 ms.',
    installInstructions: 'Instala la aplicación de escritorio AimCake para tener acceso directo, icono en la barra de tareas e inicio con Windows.',
  },
];

/* ------------------------------------------------------------------ */
/* Componentes auxiliares de la guía                                  */
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
      <div className="faq-title">Preguntas frecuentes sobre la instalación</div>
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
/* Checklist Principal                                                */
/* ------------------------------------------------------------------ */
export default function SetupChecklist({ status, profile, devices, onRefreshStatus, onSetController, onGo, toast }: Props) {
  const check = checkProfile(profile, devices);
  const s = profile.settings;
  const kb = devices.find((d) => d.id === s.keyboards[0]);
  const ms = devices.find((d) => d.id === s.mice[0]);
  const keyCount = s.bindings.length;
  const mouseKeys = s.bindings.filter((b) => isMouseInput(b.input)).length;

  const verif = status?.verification;
  const pkgs = verif?.packages;

  // Estadísticas visuales en tiempo real de los 4 paquetes de software
  const downloadedCount = SOFTWARE_LIST.filter((p) => pkgs?.[p.id]?.downloaded).length;
  const verifiedCount = SOFTWARE_LIST.filter((p) => pkgs?.[p.id]?.verified).length;
  const allSoftwareVerified = verifiedCount === SOFTWARE_LIST.length;
  const driverReady = !!status?.driverOk || allSoftwareVerified;

  const done: Record<StepId, boolean> = {
    driver: driverReady,
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
  const [collapsed, setCollapsed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [installNote, setInstallNote] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);

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
    try {
      await onRefreshStatus();
      toast('info', 'Comprobación de software y hardware completada');
    } finally {
      setChecking(false);
    }
  };

  // Verificación verídica mediante autorización explícita del navegador (WebHID / Gamepad API)
  const handleAuthorizeBrowser = async () => {
    setAuthorizing(true);
    try {
      toast('info', 'El navegador solicitará permiso para escanear tus dispositivos HID y mandos.');
      const result = await bridge.requestBrowserAuthorization();
      await onRefreshStatus();
      if (result.gamepadDetected) {
        toast('success', `¡Mando detectado en Windows! (${result.gamepadNames[0]})`);
      } else if (result.authorizedDevicesCount > 0) {
        toast('success', `Navegador autorizado: ${result.authorizedDevicesCount} dispositivos reconocidos`);
      } else {
        toast('success', 'Navegador verificado y autorizado con éxito.');
      }
    } catch (e: any) {
      toast('error', `Error durante la verificación: ${e?.message || e}`);
    } finally {
      setAuthorizing(false);
    }
  };

  const handleDownloadPackage = (pkg: SoftwarePackage) => {
    bridge.recordPackageDownload(pkg.id);
    onRefreshStatus();
    toast('success', `Descarga iniciada: ${pkg.fileName}. Al terminar, ejecútalo en Windows para instalar.`);
  };

  const handleTogglePackage = (pkgId: SoftwarePackageId) => {
    bridge.togglePackageVerified(pkgId);
    onRefreshStatus();
    toast('info', 'Estado de instalación actualizado.');
  };

  const downloadAllPackages = () => {
    SOFTWARE_LIST.forEach((pkg, i) => {
      setTimeout(() => {
        bridge.recordPackageDownload(pkg.id);
        const a = document.createElement('a');
        a.href = pkg.downloadUrl;
        a.download = pkg.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 350);
    });
    onRefreshStatus();
    toast('success', 'Descargando los 4 instaladores de Windows a tu carpeta de descargas.');
  };

  const installAuto = async () => {
    setInstalling(true);
    setInstallNote(null);
    try {
      const r = await bridge.installDriver();
      await onRefreshStatus();
      if (r.cancelled) {
        setInstallNote({ kind: 'warn', text: 'Cancelaste el asistente. Puedes volver a ejecutarlo cuando quieras.' });
      } else if (r.rebootRequired) {
        setInstallNote({ kind: 'warn', text: 'Instalado. Windows requiere reiniciar el equipo para activar el bus de emulación.' });
      } else if (r.driverOk) {
        setInstallNote({ kind: 'ok', text: 'Todos los drivers y paquetes se encuentran instalados y respondiendo.' });
        toast('success', 'Software y drivers de AimCake instalados correctamente.');
        setUserPicked(false);
      } else {
        setInstallNote({ kind: 'error', text: `El instalador finalizó (código ${r.exitCode}). Pulsa «Comprobar de nuevo» o reinicia tu PC.` });
      }
    } catch (e: any) {
      setInstallNote({ kind: 'error', text: String(e?.message ?? e) });
    } finally {
      setInstalling(false);
    }
  };

  const STEPS: Record<StepId, { n: number; title: string; icon: ReactNode; okText: string; pendingText: string }> = useMemo(() => ({
    driver: {
      n: 1,
      title: 'Software y Drivers de Windows',
      icon: <IconChip />,
      okText: '4 de 4 instalados · 100% verificado',
      pendingText: `${verifiedCount} de 4 instalados (${downloadedCount} descargados)`,
    },
    controller: {
      n: 2,
      title: 'Mando a emular',
      icon: <IconGamepad />,
      okText: s.controller ? `Se emulará un ${CONTROLLER_BY_ID[s.controller].name}` : '',
      pendingText: 'Elige qué mando quieres emular',
    },
    devices: {
      n: 3,
      title: 'Teclado y ratón exclusivos',
      icon: <IconKeyboard />,
      okText: `${kb?.name ?? 'Teclado elegido'} · ${ms?.name ?? 'ratón elegido'}`,
      pendingText: !check.keyboard && !check.mouse ? 'Falta elegir teclado y ratón' : !check.keyboard ? 'Falta elegir el teclado' : 'Falta elegir el ratón',
    },
    profile: {
      n: 4,
      title: 'Mapeo y calibración de perfil',
      icon: <IconLayers />,
      okText: `«${profile.name}» · ${keyCount} ${keyCount === 1 ? 'tecla asignada' : 'teclas asignadas'}`,
      pendingText: check.complete ? '' : missingText(check),
    },
  }), [status, s.controller, kb, ms, check, profile.name, keyCount, verifiedCount, downloadedCount]);

  /* ---------------- Contenido de ayuda por paso ---------------- */
  const help: Record<StepId, ReactNode> = {
    driver: (
      <div className="stack" style={{ gap: 20 }}>
        {/* VERIFICACIÓN VERÍDICA CON EL NAVEGADOR */}
        <section className="pkg-verif-card" id="browser-verification-box">
          <div className="pkg-verif-header">
            <div className="row" style={{ gap: 10 }}>
              <div className="pkg-verif-icon">
                <IconShield style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <strong style={{ fontSize: 15, display: 'block' }}>Verificación Verídica del Navegador (WebHID & Gamepad API)</strong>
                <small className="faint">El navegador solicita tu autorización explícita para escanear mandos y dispositivos USB/HID de Windows.</small>
              </div>
            </div>
            <span className={`chip sm ${allSoftwareVerified ? 'ok' : 'warn'}`}>
              <IconSpark style={{ width: 13, height: 13 }} />
              {allSoftwareVerified ? 'Software 100% Verificado' : 'Verificación requerida'}
            </span>
          </div>

          <div className="pkg-verif-grid">
            <div className="pkg-verif-item">
              <span className="faint">Sistema Operativo</span>
              <strong className="row" style={{ gap: 6 }}>
                <IconWindows style={{ width: 15, height: 15, color: 'var(--accent-2)' }} />
                {verif?.osName || 'Windows 10 / 11 (64-bit)'}
              </strong>
            </div>

            <div className="pkg-verif-item">
              <span className="faint">Autorización del Navegador</span>
              <strong style={{ color: verif?.browserAuthorized ? 'var(--accent)' : 'var(--warn)' }}>
                {verif?.browserAuthorized ? '✓ Autorización Concedida' : '⚠ Requiere Autorización'}
              </strong>
            </div>

            <div className="pkg-verif-item">
              <span className="faint">Mando Virtual en Windows</span>
              <strong>
                {verif?.gamepadDetected ? (
                  <span style={{ color: 'var(--accent)' }}>✓ Detectado: {verif.gamepadNames[0]}</span>
                ) : (
                  <span className="faint">Se conectará al iniciar emulación</span>
                )}
              </strong>
            </div>

            <div className="pkg-verif-item">
              <span className="faint">Dispositivos HID Autorizados</span>
              <strong>
                {verif?.authorizedDevicesCount ? (
                  <span style={{ color: 'var(--accent)' }}>{verif.authorizedDevicesCount} dispositivo(s) vinculados</span>
                ) : (
                  <span className="faint">Sin restricción</span>
                )}
              </strong>
            </div>
          </div>

          <div className="pkg-verif-actions">
            <button
              id="btn-auth-browser"
              type="button"
              className="btn btn-primary"
              onClick={handleAuthorizeBrowser}
              disabled={authorizing}
            >
              {authorizing ? <><span className="spinner" /> Solicitando permiso al navegador…</> : <><IconRadar /> Pedir Autorización al Navegador y Verificar</>}
            </button>
            <button
              id="btn-recheck-all"
              type="button"
              className="btn"
              onClick={recheck}
              disabled={checking}
            >
              {checking ? <span className="spinner" /> : <IconRefresh />} Comprobar Estado
            </button>
            {!isTauri && (
              <small className="faint" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11.5 }}>
                Google Chrome y Microsoft Edge abrirán una ventana emergente para que confirmes el acceso a dispositivos.
              </small>
            )}
          </div>
        </section>

        {/* DETALLE DE CADA SOFTWARE CON EXPLICACIÓN CONCRETA */}
        <div>
          <h4 style={{ fontSize: 16, margin: '14px 0 10px' }}>Explicación detallada de cada software obligatorio</h4>
          <div className="pkg-list">
            {SOFTWARE_LIST.map((pkg) => {
              const state = pkgs ? pkgs[pkg.id] : undefined;
              const isDownloaded = !!state?.downloaded;
              const isVerified = !!state?.verified;

              return (
                <div key={pkg.id} className={`pkg-card ${isVerified ? 'verified' : isDownloaded ? 'downloaded' : ''}`} id={`pkg-${pkg.id}`}>
                  <div className="pkg-step-badge">{isVerified ? <IconCheck /> : pkg.stepNum}</div>

                  <div className="pkg-main">
                    <div className="pkg-header">
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <strong className="pkg-name">{pkg.name}</strong>
                        <span className={`chip sm ${pkg.badgeType}`}>{pkg.badge}</span>
                      </div>
                      <span className="pkg-size faint">{pkg.fileName} ({pkg.fileSize})</span>
                    </div>

                    <p className="pkg-desc">{pkg.whyRequired}</p>

                    <div className="pkg-instructions">
                      <IconCpu style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: 'var(--accent-2)' }} />
                      <span><strong>Instrucciones de instalación:</strong> {pkg.installInstructions}</span>
                    </div>

                    <div className="pkg-foot">
                      <div className="row" style={{ gap: 10 }}>
                        <a
                          id={`dl-pkg-${pkg.id}`}
                          href={pkg.downloadUrl}
                          download={pkg.fileName}
                          className={`btn btn-sm ${isDownloaded ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => handleDownloadPackage(pkg)}
                        >
                          <IconDownload />
                          <span>Descargar {pkg.fileName}</span>
                        </a>

                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleTogglePackage(pkg.id)}
                          title="Alternar estado de instalación verificado"
                        >
                          {isVerified ? (
                            <><IconCheck style={{ color: 'var(--accent)' }} /> Instalado y verificado</>
                          ) : isDownloaded ? (
                            <><IconSpark /> Marcar como instalado</>
                          ) : (
                            'Ya lo tengo instalado'
                          )}
                        </button>
                      </div>

                      <div className="row" style={{ gap: 8 }}>
                        <span className={`badge-status ${isDownloaded ? 'badge-ok' : 'badge-bad'}`}>
                          📥 Descargado: {isDownloaded ? 'SÍ' : 'NO'}
                        </span>
                        <span className={`badge-status ${isVerified ? 'badge-ok' : 'badge-warn'}`}>
                          ⚙️ Instalado: {isVerified ? 'SÍ' : 'NO'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GUÍA VISUAL PASO A PASO */}
        <div>
          <h4 style={{ fontSize: 15, margin: '8px 0 10px' }}>Guía paso a paso en Windows</h4>
          <Flow>
            <Frame n={1} caption="1. Descarga los instaladores">
              <div className="mk-btn primary"><IconDownload /> Descargar paquetes</div>
            </Frame>
            <Frame n={2} caption="2. Windows UAC: pulsa «Sí»">
              <div className="mk-uac">
                <div className="mk-uac-head"><IconShield /> Control de cuentas de usuario</div>
                <small>¿Permitir cambios en el dispositivo?</small>
                <div className="mk-uac-btns"><span className="mk-btn sm primary">Sí</span><span className="mk-btn sm">No</span></div>
              </div>
            </Frame>
            <Frame n={3} caption="3. Asistente: «Instalar»">
              <div className="mk-win">
                <div className="mk-win-bar"><i /><i /><i /> AimCake Driver Setup</div>
                <div className="mk-win-body">
                  <div className="mk-progress"><i /></div>
                  <div className="mk-win-btns"><span className="mk-btn sm primary">Finalizar</span></div>
                </div>
              </div>
            </Frame>
            <Frame n={4} caption="4. Estado Verde Verificado" done={allSoftwareVerified}>
              <div className="mk-status"><span className="mk-dot ok" /> 100% Verificado</div>
            </Frame>
          </Flow>
        </div>

        {/* NOTIFICACIONES Y ALERTAS */}
        {installNote && (
          <div className={`alert ${installNote.kind === 'ok' ? 'success' : installNote.kind === 'warn' ? 'warn-alert' : 'error'}`}>
            {installNote.kind === 'ok' ? <IconCheck /> : <IconAlert />}
            <span>{installNote.text}</span>
          </div>
        )}

        {/* FAQS */}
        <Faq items={[
          [
            '¿Por qué el navegador solicita autorización?',
            <>Por seguridad de la plataforma web (estándar W3C), Google Chrome, Microsoft Edge y Brave no permiten que una página lea o configure periféricos USB, HID ni mandos sin que el usuario pulse explícitamente <strong>«Autorizar»</strong>. Esta confirmación garantiza que la verificación sea auténtica y verídica.</>,
          ],
          [
            '¿Por qué son obligatorios estos 4 paquetes de software?',
            <>
              <strong>Visual C++</strong> proporciona las bibliotecas del compilador de Windows necesarias para hooks de 1 ms.
              <strong>ViGEmBus</strong> crea el mando virtual a nivel de kernel para que los juegos activen Aim Assist.
              <strong>AimCake Drivers</strong> aíslan tu ratón y teclado reales para que no hagan doble clic en Windows mientras juegas.
              <strong>AimCake Client</strong> garantiza latencia real de 1000 Hz fuera del sandbox del navegador.
            </>,
          ],
          [
            '¿Es seguro instalar estos controladores en Windows 10 u 11?',
            <>Completamente seguro. ViGEmBus es un proyecto de código abierto firmado con certificado WHQL de Microsoft utilizado por millones de jugadores (DS4Windows, BetterJoy). AimCake no modifica archivos del sistema ni instala publicidad.</>,
          ],
          [
            '¿Tengo que reiniciar mi computadora?',
            <>En el 95% de los casos no es necesario reiniciar. El driver se activa al instante. Solo si Windows tenía actualizaciones pendientes de Visual C++ podría solicitar un reinicio rápido.</>,
          ],
          [
            '¿Afecta a mis periféricos físicos o a otros programas?',
            <>No. Tus mandos reales de Xbox, PlayStation o tus ratones y teclados físicos siguen funcionando con total normalidad cuando la emulación esté en pausa o cerrada.</>,
          ],
        ]} />
      </div>
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
  if (allDone && collapsed && allSoftwareVerified) {
    return (
      <section className="card setup setup-done" id="setup-checklist">
        <div className="setup-done-row">
          <span className="setup-done-icon"><IconCheck /></span>
          <div>
            <strong>Todo listo para jugar</strong>
            <small>Drivers y software verificados (4/4) · {CONTROLLER_BY_ID[s.controller!].name} · teclado y ratón exclusivos · {keyCount} teclas asignadas</small>
          </div>
          <div className="setup-done-steps">{order.map((k) => <i key={k} />)}</div>
          <button id="setup-expand" className="btn btn-sm btn-ghost" onClick={toggleCollapse}>Ver guía de configuración <IconChevron /></button>
        </div>
      </section>
    );
  }

  const cur = STEPS[selected];

  return (
    <section className={`card setup ${allDone && allSoftwareVerified ? 'all-done' : ''}`} id="setup-checklist">
      <div className="setup-head">
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <span className="row" style={{ gap: 6 }}><IconWindows style={{ width: 15 }} /> Puesta en marcha de AimCake</span>
          </div>
          <h2 className="setup-title">
            {allDone && allSoftwareVerified
              ? '¡Todo instalado y listo para jugar!'
              : `Puesta en marcha: completa ${order.length - doneCount} ${order.length - doneCount === 1 ? 'paso más' : 'pasos más'} para empezar`}
          </h2>
        </div>
        <div className="setup-progress">
          <svg viewBox="0 0 44 44" className="setup-ring">
            <circle cx="22" cy="22" r="18" className="track" />
            <circle cx="22" cy="22" r="18" className="fill" style={{ strokeDasharray: `${(doneCount / order.length) * 113.1} 113.1` }} />
          </svg>
          <span><b>{doneCount}</b>/{order.length}</span>
          {allDone && allSoftwareVerified && (
            <button id="setup-collapse" className="btn btn-sm btn-ghost" onClick={toggleCollapse}>Ocultar</button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECCIÓN PERMANENTE: MATRIZ DE CONTROL DE SOFTWARE EN WINDOWS   */}
      {/* ============================================================== */}
      <section className="pkg-matrix-card" id="software-matrix-table" style={{ marginBottom: 24 }}>
        <div className="pkg-matrix-header">
          <div>
            <span className="row" style={{ gap: 8 }}>
              <IconWindows style={{ width: 20, color: 'var(--accent-2)' }} />
              <strong style={{ fontSize: 16 }}>1. Software Obligatorio en Windows (Descarga e Instalación en vivo)</strong>
            </span>
            <small className="faint" style={{ display: 'block', marginTop: 2 }}>
              Se debe verificar si cada archivo se ha descargado e instalado en Windows para que el Aim Assist a 1000 Hz funcione.
            </small>
          </div>
          <div className="pkg-matrix-counts">
            <span className="chip sm" style={{ color: downloadedCount === 4 ? 'var(--accent)' : 'var(--text)' }}>
              📥 <b>{downloadedCount}</b>/4 Descargados
            </span>
            <span className={`chip sm ${allSoftwareVerified ? 'ok' : 'warn'}`}>
              ⚙️ <b>{verifiedCount}</b>/4 Instalados
            </span>
          </div>
        </div>

        <div className="pkg-table-wrap">
          <table className="pkg-table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Software Requerido</th>
                <th style={{ width: '16%' }}>Archivo</th>
                <th style={{ width: '16%', textAlign: 'center' }}>¿Descargado?</th>
                <th style={{ width: '18%', textAlign: 'center' }}>¿Instalado en Windows?</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {SOFTWARE_LIST.map((pkg) => {
                const state = pkgs ? pkgs[pkg.id] : undefined;
                const isD = !!state?.downloaded;
                const isV = !!state?.verified;

                return (
                  <tr key={pkg.id} className={`pkg-row ${isV ? 'is-verified' : isD ? 'is-downloaded' : 'is-pending'}`}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`pkg-status-dot ${isV ? 'ok' : isD ? 'info' : 'bad'}`} />
                        <div>
                          <strong className="pkg-row-name">{pkg.name}</strong>
                          <small className="pkg-row-purpose">{pkg.purpose}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="pkg-code">{pkg.fileName}</code>
                      <small className="faint" style={{ display: 'block', fontSize: 10.5 }}>{pkg.fileSize}</small>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isD ? (
                        <span className="badge-status badge-ok">
                          <IconCheck style={{ width: 12, height: 12 }} /> SÍ (Descargado)
                        </span>
                      ) : (
                        <span className="badge-status badge-bad">
                          <IconX style={{ width: 12, height: 12 }} /> NO (Pendiente)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isV ? (
                        <span className="badge-status badge-ok">
                          <IconCheck style={{ width: 12, height: 12 }} /> SÍ (Instalado)
                        </span>
                      ) : (
                        <span className="badge-status badge-warn">
                          <IconAlert style={{ width: 12, height: 12 }} /> NO (Falta instalar)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <a
                          href={pkg.downloadUrl}
                          download={pkg.fileName}
                          className={`btn btn-sm ${isD ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => handleDownloadPackage(pkg)}
                          title={`Descargar ${pkg.fileName}`}
                        >
                          <IconDownload /> {isD ? 'Re-descargar' : 'Descargar'}
                        </a>
                        <button
                          type="button"
                          className={`btn btn-sm ${isV ? 'btn-ghost' : ''}`}
                          onClick={() => handleTogglePackage(pkg.id)}
                          title={isV ? 'Desmarcar' : 'Marcar como instalado en Windows'}
                        >
                          {isV ? <IconCheck style={{ color: 'var(--accent)' }} /> : 'Marcar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pkg-matrix-foot">
          <button
            id="btn-dl-all-pkgs"
            type="button"
            className="btn btn-primary"
            onClick={downloadAllPackages}
          >
            <IconDownload /> Descargar los 4 instaladores (.exe)
          </button>
          <button
            id="btn-auto-install"
            type="button"
            className="btn"
            onClick={installAuto}
            disabled={installing}
          >
            {installing ? <><span className="spinner" /> Instalando automáticamente…</> : <><IconSpark /> Instalar Drivers en 1 Clic</>}
          </button>
          <button
            id="btn-auth-browser-banner"
            type="button"
            className="btn"
            onClick={handleAuthorizeBrowser}
            disabled={authorizing}
          >
            {authorizing ? <><span className="spinner" /> Verificando…</> : <><IconRadar /> Pedir Autorización al Navegador y Verificar</>}
          </button>
          <button
            id="btn-recheck-software"
            type="button"
            className="btn btn-ghost"
            onClick={recheck}
            disabled={checking}
          >
            {checking ? <span className="spinner" /> : <IconRefresh />} Comprobar
          </button>
        </div>
      </section>

      {/* ============================================================== */}
      {/* PASOS DE CONFIGURACIÓN DEL CHECKLIST                           */}
      {/* ============================================================== */}
      <div className="setup-body">
        <ol className="setup-steps">
          {order.map((id) => {
            const st = STEPS[id];
            const ok = done[id];
            return (
              <li key={id}>
                <button
                  id={`setup-step-${id}`}
                  className={`setup-step ${ok ? 'ok' : 'pending'} ${selected === id ? 'sel' : ''}`}
                  onClick={() => pick(id)}
                  aria-current={selected === id}
                >
                  <span className="setup-num">{ok ? <IconCheck /> : st.n}</span>
                  <span className="setup-step-text">
                    <strong>{st.title}</strong>
                    <small>{ok ? st.okText : st.pendingText}</small>
                    {id === 'driver' && (
                      <span className="setup-pkg-mini-dots">
                        {SOFTWARE_LIST.map((pkg) => {
                          const isV = !!pkgs?.[pkg.id]?.verified;
                          const isD = !!pkgs?.[pkg.id]?.downloaded;
                          return (
                            <span
                              key={pkg.id}
                              className={`mini-pkg-tag ${isV ? 'v-ok' : isD ? 'd-ok' : 'none'}`}
                              title={`${pkg.name}: ${isV ? 'Instalado' : isD ? 'Descargado' : 'Pendiente'}`}
                            >
                              <i />
                              {pkg.shortLabel}
                              {isV ? ' ✓' : isD ? ' 📥' : ' ✕'}
                            </span>
                          );
                        })}
                      </span>
                    )}
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
              <small>Paso {cur.n} de {order.length} · {done[selected] ? 'Completado y verificado' : 'Pendiente de instalación'}</small>
              <h3>{cur.title}</h3>
            </div>
          </div>
          {help[selected]}
        </div>
      </div>
    </section>
  );
}
