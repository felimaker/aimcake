import { useState, useMemo } from 'react';
import type { ControllerType, EngineStatus, InputDevice, Profile, SoftwarePackageId } from '../types';
import { checkProfile } from '../lib/profiles';
import { isMouseInput } from '../lib/keys';
import { bridge, isTauri } from '../services/tauriBridge';
import {
  IconArrowRight, IconCheck, IconChip, IconCpu, IconCurve, IconDownload,
  IconGamepad, IconKeyboard, IconLayers, IconMouse, IconRefresh, IconSpark
} from './Icons';

export type StepNum = 1 | 2 | 3 | 4 | 5;
type GoView = 'devices' | 'mapping' | 'curve' | 'profiles';

interface Props {
  status: EngineStatus | null;
  profile: Profile;
  devices: InputDevice[];
  onRefreshStatus: () => Promise<void>;
  onSetController: (c: ControllerType) => void;
  onUpdateProfile?: (p: Profile) => void;
  onGo: (view: GoView) => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

interface InstallablePackage {
  id: SoftwarePackageId;
  name: string;
  badge: string;
  badgeType: 'ok' | 'info';
  fileName: string;
  fileSize: string;
  downloadUrl: string;
  benefit: string;
}

const INSTALLABLE_PACKAGES: InstallablePackage[] = [
  {
    id: 'vigembus',
    name: 'Driver de Asistencia AimCake',
    badge: 'Aim Assist',
    badgeType: 'ok',
    fileName: 'AimCake_bigembus.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/AimCake_bigembus.exe',
    benefit: 'Activa la asistencia de apuntado nativa (Aim Assist) jugando con tu ratón y teclado.',
  },
  {
    id: 'aimcake_drivers',
    name: 'Aislamiento de Periféricos AimCake',
    badge: 'Sin Doble Cursor',
    badgeType: 'ok',
    fileName: 'AimCake_drivers.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/aimcake_drivers.exe',
    benefit: 'Elimina el doble cursor en pantalla y garantiza respuesta inmediata de 1 ms.',
  },
  {
    id: 'vcredist',
    name: 'Librerías de Rendimiento (Visual C++)',
    badge: 'Compatibilidad',
    badgeType: 'info',
    fileName: 'AimCake_vcredist.exe',
    fileSize: '~25.6 MB',
    downloadUrl: '/downloads/AimCake_vcredist.exe',
    benefit: 'Garantiza que Aim Assist funcione fluido, estable y sin errores en Windows.',
  },
  {
    id: 'aimcake_bridge',
    name: 'Aplicación de Escritorio AimCake',
    badge: 'App Windows',
    badgeType: 'info',
    fileName: 'AimCake_Setup.exe',
    fileSize: '~6.3 MB',
    downloadUrl: '/downloads/AimCake_Setup.exe',
    benefit: 'Te permite abrir AimCake con un clic y jugar con Aim Assist activo en segundo plano.',
  },
];

const POPULAR_GAMES = [
  'Call of Duty: Warzone',
  'Call of Duty: Modern Warfare III',
  'Apex Legends',
  'Fortnite',
  'Battlefield 2042',
  'Halo Infinite',
  'Destiny 2',
];

export default function SetupChecklist({
  status,
  profile,
  devices,
  onRefreshStatus,
  onSetController,
  onUpdateProfile,
  onGo,
  toast,
}: Props) {
  const check = checkProfile(profile, devices);
  const s = profile.settings;

  // Dispositivos actuales
  const kb = devices.find((d) => d.id === s.keyboards[0]);
  const ms = devices.find((d) => d.id === s.mice[0]);
  const mappedCount = s.bindings.length;
  const mouseBindingsCount = s.bindings.filter((b) => isMouseInput(b.input)).length;

  // Estado de los paquetes de software
  const pkgs = status?.verification?.packages;
  const driverReady = !!status?.driverOk;
  
  // Conteo de paquetes verificados
  const verifiedCount = INSTALLABLE_PACKAGES.filter(
    (p) => pkgs?.[p.id]?.verified || (p.id === 'vigembus' && driverReady)
  ).length;
  const allSoftwareReady = driverReady || verifiedCount >= 3;

  // Estados de completitud de cada uno de los 5 pasos
  const stepCompleted: Record<StepNum, boolean> = {
    1: allSoftwareReady,
    2: Boolean(profile.name.trim().length > 0),
    3: Boolean(s.controller && s.keyboards.length > 0 && s.mice.length > 0),
    4: Boolean(mappedCount >= 4),
    5: Boolean(s.config.sensitivity > 0 && s.config.exponent > 0),
  };

  const completedCount = Object.values(stepCompleted).filter(Boolean).length;

  // Paso inicial según el primer pendiente
  const firstPending: StepNum = useMemo(() => {
    for (let i = 1; i <= 5; i++) {
      if (!stepCompleted[i as StepNum]) return i as StepNum;
    }
    return 1;
  }, [stepCompleted]);

  const [activeStep, setActiveStep] = useState<StepNum>(firstPending);
  const [profileNameDraft, setProfileNameDraft] = useState(profile.name);
  const [checkingDrivers, setCheckingDrivers] = useState(false);
  const [installingAuto, setInstallingAuto] = useState(false);

  // Sincronizar nombre si cambia externamente
  useMemo(() => {
    setProfileNameDraft(profile.name);
  }, [profile.name]);

  const handleSaveProfileName = (name: string, game?: string) => {
    if (!onUpdateProfile) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    onUpdateProfile({
      ...profile,
      name: trimmed,
      game: game !== undefined ? game : profile.game,
      updatedAt: Date.now(),
    });
    toast('success', `Perfil actualizado: «${trimmed}»`);
  };

  const handleDeviceChange = (type: 'keyboard' | 'mouse', deviceId: string) => {
    if (!onUpdateProfile) return;
    const nextSettings = {
      ...s,
      keyboards: type === 'keyboard' ? (deviceId ? [deviceId] : []) : s.keyboards,
      mice: type === 'mouse' ? (deviceId ? [deviceId] : []) : s.mice,
    };
    onUpdateProfile({
      ...profile,
      settings: nextSettings,
      updatedAt: Date.now(),
    });
    toast('info', `${type === 'keyboard' ? 'Teclado' : 'Ratón'} asignado al perfil.`);
  };

  const handleRecheckDriver = async () => {
    setCheckingDrivers(true);
    try {
      await onRefreshStatus();
      toast('info', 'Comprobación de software y drivers de Windows actualizada.');
    } finally {
      setCheckingDrivers(false);
    }
  };

  const handleDownloadPackage = (pkg: InstallablePackage) => {
    bridge.recordPackageDownload(pkg.id);
    onRefreshStatus();
    toast('info', `Iniciando descarga de ${pkg.fileName}...`);
  };

  const handleDownloadAll = () => {
    INSTALLABLE_PACKAGES.forEach((pkg, index) => {
      setTimeout(() => {
        bridge.recordPackageDownload(pkg.id);
        const link = document.createElement('a');
        link.href = pkg.downloadUrl;
        link.download = pkg.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 320);
    });
    onRefreshStatus();
    toast('success', 'Descargando los 4 instaladores de Windows a tu carpeta de descargas.');
  };

  const handleToggleVerified = (pkgId: SoftwarePackageId) => {
    bridge.togglePackageVerified(pkgId);
    onRefreshStatus();
    toast('info', 'Estado de instalación actualizado.');
  };

  const handleInstallAuto = async () => {
    setInstallingAuto(true);
    try {
      const res = await bridge.installDriver();
      await onRefreshStatus();
      if (res.driverOk) {
        toast('success', 'ViGEmBus instalado y verificado con éxito en Windows.');
      } else if (res.rebootRequired) {
        toast('info', 'Instalación completa. Windows requiere reiniciar el equipo.');
      } else if (res.cancelled) {
        toast('info', 'Instalación cancelada.');
      } else {
        toast('error', `Error en la instalación (código ${res.exitCode}).`);
      }
    } catch (e: any) {
      toast('error', `Error al instalar: ${e?.message || e}`);
    } finally {
      setInstallingAuto(false);
    }
  };

  const STEPS_META = [
    { num: 1 as StepNum, title: 'Instalables (.exe)', label: 'Software e Instalables', icon: <IconChip /> },
    { num: 2 as StepNum, title: 'Perfil', label: 'Nombre y Juego', icon: <IconLayers /> },
    { num: 3 as StepNum, title: 'Dispositivos', label: 'Protocolo, Mouse y Teclado', icon: <IconGamepad /> },
    { num: 4 as StepNum, title: 'Mapeo', label: 'Asignación de Teclas', icon: <IconKeyboard /> },
    { num: 5 as StepNum, title: 'Curva', label: 'Bézier y Deadzone', icon: <IconCurve /> },
  ];

  return (
    <div className="card setup-wizard-card">
      {/* Wizard Header Bar */}
      <div className="wizard-top-bar">
        <div className="wizard-title-group">
          <div className="wizard-badge-icon">
            <IconSpark style={{ width: 20, height: 20, color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Configuración Secuencial del Sistema
            </h3>
            <span className="faint" style={{ fontSize: 12.5 }}>
              Paso {activeStep} de 5 · {completedCount === 5 ? '¡Todo listo para jugar!' : `${5 - completedCount} paso(s) por completar`}
            </span>
          </div>
        </div>

        <div className="wizard-progress-pill">
          <div className="wizard-progress-fill" style={{ width: `${(completedCount / 5) * 100}%` }} />
          <span>{completedCount}/5 Completados</span>
        </div>
      </div>

      {/* Stepper Navigation Tabs */}
      <div className="wizard-stepper">
        {STEPS_META.map((st) => {
          const isDone = stepCompleted[st.num];
          const isCurrent = activeStep === st.num;
          return (
            <button
              key={st.num}
              type="button"
              className={`wizard-step-btn ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
              onClick={() => setActiveStep(st.num)}
            >
              <div className="wizard-step-circle">
                {isDone ? <IconCheck style={{ width: 14, height: 14 }} /> : st.num}
              </div>
              <div className="wizard-step-info">
                <span className="wizard-step-num-text">Paso {st.num}</span>
                <strong className="wizard-step-name">{st.title}</strong>
              </div>
            </button>
          );
        })}
      </div>

      {/* Wizard Step Body */}
      <div className="wizard-content">
        {/* ======================================================== */}
        {/* PASO 1: INSTALACIÓN DE TODOS LOS INSTALABLES (.EXE)      */}
        {/* ======================================================== */}
        {activeStep === 1 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconChip /></div>
              <div>
                <h4>Paso 1: Instalación de Todos los Software e Instalables (.exe)</h4>
                <p className="faint">
                  Descarga e instala los componentes necesarios en Windows para habilitar tu Aim Assist a 1000 Hz con aislamiento de periféricos.
                </p>
              </div>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                <span className={`chip ${allSoftwareReady ? 'ok' : 'warn'}`}>
                  <span className="dot" />
                  {allSoftwareReady ? `${verifiedCount} de 4 Verificados` : `${verifiedCount} de 4 Instalados`}
                </span>
              </div>
            </div>

            {/* Barra de Acciones Globales del Paso 1 */}
            <div className="wizard-pkg-bulk-bar">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDownloadAll}
                >
                  <IconDownload /> Descargar los 4 Instalables (.exe)
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={handleRecheckDriver}
                  disabled={checkingDrivers}
                >
                  {checkingDrivers ? <span className="spinner" /> : <IconRefresh />} Validar Instalación de Todo
                </button>

                {isTauri && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleInstallAuto}
                    disabled={installingAuto}
                  >
                    {installingAuto ? <span className="spinner" /> : <IconCpu />} Instalar Automático (Tauri)
                  </button>
                )}
              </div>
              <span className="faint" style={{ fontSize: 12 }}>
                💡 Puedes descargar cada paquete individualmente o pulsar «Descargar los 4 Instalables».
              </span>
            </div>

            {/* Grid con los 4 Software / Instalables Requeridos */}
            <div className="wizard-pkg-grid">
              {INSTALLABLE_PACKAGES.map((pkg, idx) => {
                const isDownloaded = Boolean(pkgs?.[pkg.id]?.downloaded);
                const isVerified = Boolean(pkgs?.[pkg.id]?.verified || (pkg.id === 'vigembus' && driverReady));

                return (
                  <div key={pkg.id} className={`wizard-pkg-card ${isVerified ? 'verified' : isDownloaded ? 'downloaded' : ''}`}>
                    <div className="wizard-pkg-card-top">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="wizard-pkg-num">{idx + 1}</span>
                        <div>
                          <strong className="wizard-pkg-title">{pkg.name}</strong>
                          <div className="row" style={{ gap: 6, marginTop: 2 }}>
                            <span className={`chip sm ${pkg.badgeType}`}>{pkg.badge}</span>
                            <span className="faint" style={{ fontSize: 11.5 }}>{pkg.fileName} ({pkg.fileSize})</span>
                          </div>
                        </div>
                      </div>
                      <span className={`chip xs ${isVerified ? 'ok' : isDownloaded ? 'info' : 'warn'}`}>
                        {isVerified ? '✓ Instalado' : isDownloaded ? 'Descargado' : 'Pendiente'}
                      </span>
                    </div>

                    <p className="wizard-pkg-benefit">
                      <IconCheck style={{ width: 14, height: 14, color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                      <span>{pkg.benefit}</span>
                    </p>

                    <div className="wizard-pkg-actions">
                      <a
                        href={pkg.downloadUrl}
                        download={pkg.fileName}
                        className={`btn btn-sm ${isDownloaded ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => handleDownloadPackage(pkg)}
                      >
                        <IconDownload /> Descargar {pkg.fileName}
                      </a>

                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleToggleVerified(pkg.id)}
                        title="Marcar manualmente si ya lo instalaste"
                      >
                        {isVerified ? (
                          <><IconCheck style={{ color: 'var(--accent)' }} /> Verificado</>
                        ) : (
                          'Marcar como instalado'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Acciones del pie */}
            <div className="wizard-footer-actions">
              <span className="faint" style={{ fontSize: 13 }}>
                Una vez instalados los ejecutables en Windows, pulsa siguiente para continuar configurando tu perfil.
              </span>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveStep(2)}
                style={{ marginLeft: 'auto' }}
              >
                Siguiente: Perfil de Juego <IconArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 2: NOMBRE DEL PERFIL Y JUEGO                        */}
        {/* ======================================================== */}
        {activeStep === 2 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconLayers /></div>
              <div>
                <h4>Paso 2: Da Nombre a tu Perfil de Juego</h4>
                <p className="faint">
                  Cada perfil almacena de forma independiente su nombre, dispositivos exclusivos, mapeo de teclas y curva de sensibilidad.
                </p>
              </div>
            </div>

            <div className="wizard-pane-card">
              <div className="field">
                <label htmlFor="wizard-profile-name">Nombre del perfil activo</label>
                <div className="row" style={{ gap: 10 }}>
                  <input
                    id="wizard-profile-name"
                    type="text"
                    className="input"
                    value={profileNameDraft}
                    onChange={(e) => setProfileNameDraft(e.target.value)}
                    placeholder="Ej. Warzone Pro, Apex Ranked, COD MW3..."
                    style={{ maxWidth: 380 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveProfileName(profileNameDraft);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleSaveProfileName(profileNameDraft)}
                    disabled={!profileNameDraft.trim() || profileNameDraft.trim() === profile.name}
                  >
                    <IconCheck /> Guardar Nombre
                  </button>
                </div>
              </div>

              {/* Selector de Juego Base */}
              <div className="field" style={{ marginTop: 16 }}>
                <label>Seleccionar o cambiar juego:</label>
                <div className="wizard-game-tags">
                  {POPULAR_GAMES.map((game) => {
                    const isSelected = profile.game === game;
                    return (
                      <button
                        key={game}
                        type="button"
                        className={`wizard-game-tag ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          handleSaveProfileName(profileNameDraft || game, game);
                        }}
                      >
                        {isSelected && <IconCheck style={{ width: 13, height: 13 }} />}
                        {game}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="row-between" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <span className="faint" style={{ fontSize: 13 }}>
                  ¿Quieres gestionar múltiples perfiles independientes?
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => onGo('profiles')}
                >
                  <IconLayers /> Administrador de Perfiles
                </button>
              </div>
            </div>

            <div className="wizard-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setActiveStep(1)}>
                Volver a Instalables (.exe)
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveStep(3)}
                style={{ marginLeft: 'auto' }}
              >
                Siguiente: Dispositivos Únicos <IconArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 3: DISPOSITIVOS ÚNICOS (PROTOCOLO + MOUSE + TECLADO) */}
        {/* ======================================================== */}
        {activeStep === 3 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconGamepad /></div>
              <div>
                <h4>Paso 3: Protocolo de Asistencia, Mouse y Teclado Únicos</h4>
                <p className="faint">
                  AimCake aísla exactamente 1 teclado y 1 ratón para este perfil, activando tu Aim Assist con respuesta inmediata de 1000 Hz.
                </p>
              </div>
              <span className={`chip ${check.keyboard && check.mouse && check.controller ? 'ok' : 'warn'}`} style={{ marginLeft: 'auto' }}>
                <span className="dot" />
                {check.keyboard && check.mouse && check.controller ? 'Dispositivos Asignados' : 'Configuración Incompleta'}
              </span>
            </div>

            <div className="grid grid-3" style={{ gap: 16 }}>
              {/* 1. Protocolo de Asistencia */}
              <div className="wizard-device-box">
                <div className="wizard-device-head">
                  <IconGamepad style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                  <strong>1. Protocolo de Asistencia</strong>
                </div>
                <p className="faint" style={{ fontSize: 12.5 }}>Tipo de asistencia nativa aplicada en Windows:</p>
                <div className="stack" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className={`wizard-opt-btn ${s.controller === 'X360' ? 'selected' : ''}`}
                    onClick={() => onSetController('X360')}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <span className="wizard-opt-radio" />
                      <strong>Protocolo Xbox (XInput)</strong>
                    </div>
                    <span className="chip xs ok">Recomendado</span>
                  </button>

                  <button
                    type="button"
                    className={`wizard-opt-btn ${s.controller === 'DS4' ? 'selected' : ''}`}
                    onClick={() => onSetController('DS4')}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <span className="wizard-opt-radio" />
                      <strong>Protocolo PlayStation (DualShock)</strong>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Ratón Exclusivo */}
              <div className="wizard-device-box">
                <div className="wizard-device-head">
                  <IconMouse style={{ width: 18, height: 18, color: 'var(--accent-2)' }} />
                  <strong>2. Ratón Exclusivo</strong>
                </div>
                <p className="faint" style={{ fontSize: 12.5 }}>Ratón que controlará el Stick Derecho (Aim Assist):</p>
                <select
                  className="input"
                  value={s.mice[0] ?? ''}
                  onChange={(e) => handleDeviceChange('mouse', e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Seleccionar Ratón --</option>
                  {devices.filter((d) => d.kind === 'mouse').map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.connection ? `(${d.connection})` : ''}
                    </option>
                  ))}
                </select>
                <div className="wizard-device-status">
                  {ms ? (
                    <span className="row" style={{ gap: 6, color: 'var(--accent)' }}>
                      <IconCheck style={{ width: 14 }} /> {ms.name}
                    </span>
                  ) : (
                    <span className="faint" style={{ color: 'var(--warn)' }}>⚠ Selecciona tu ratón de juego</span>
                  )}
                </div>
              </div>

              {/* 3. Teclado Exclusivo */}
              <div className="wizard-device-box">
                <div className="wizard-device-head">
                  <IconKeyboard style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                  <strong>3. Teclado Exclusivo</strong>
                </div>
                <p className="faint" style={{ fontSize: 12.5 }}>Teclado que controlará los botones y movimiento:</p>
                <select
                  className="input"
                  value={s.keyboards[0] ?? ''}
                  onChange={(e) => handleDeviceChange('keyboard', e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Seleccionar Teclado --</option>
                  {devices.filter((d) => d.kind === 'keyboard').map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.connection ? `(${d.connection})` : ''}
                    </option>
                  ))}
                </select>
                <div className="wizard-device-status">
                  {kb ? (
                    <span className="row" style={{ gap: 6, color: 'var(--accent)' }}>
                      <IconCheck style={{ width: 14 }} /> {kb.name}
                    </span>
                  ) : (
                    <span className="faint" style={{ color: 'var(--warn)' }}>⚠ Selecciona tu teclado</span>
                  )}
                </div>
              </div>
            </div>

            <div className="wizard-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setActiveStep(2)}>
                Volver a Perfil
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveStep(4)}
                style={{ marginLeft: 'auto' }}
              >
                Siguiente: Mapeo de Controles <IconArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 4: MAPEO DE CONTROLES                               */}
        {/* ======================================================== */}
        {activeStep === 4 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconKeyboard /></div>
              <div>
                <h4>Paso 4: Mapeo de Teclas y Acciones</h4>
                <p className="faint">
                  Revisa y asigna cada tecla de tu teclado y clicks del ratón a las acciones y movimientos en juego.
                </p>
              </div>
              <span className={`chip ${mappedCount >= 4 ? 'ok' : 'warn'}`} style={{ marginLeft: 'auto' }}>
                <span className="dot" />
                {mappedCount} acciones asignadas
              </span>
            </div>

            <div className="wizard-pane-card">
              <div className="grid grid-3" style={{ gap: 14 }}>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Movimiento (Stick Izquierdo)</span>
                  <strong>WASD Tradicional</strong>
                  <small className="faint">W: Arriba, S: Abajo, A: Izq, D: Der</small>
                </div>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Combate (Gatillos)</span>
                  <strong>LMB / RMB</strong>
                  <small className="faint">Click Izq: Gatillo R2 (Disparo) · Click Der: L2 (Apuntar)</small>
                </div>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Acciones de Mouse</span>
                  <strong>{mouseBindingsCount} asignadas</strong>
                  <small className="faint">Clicks y rueda traducidos a acciones</small>
                </div>
              </div>

              <div className="row-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  Personaliza cada botón con detección en vivo, doble click y combinaciones.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onGo('mapping')}
                >
                  <IconKeyboard /> Abrir Mapeador Detallado
                </button>
              </div>
            </div>

            <div className="wizard-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setActiveStep(3)}>
                Volver a Dispositivos
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveStep(5)}
                style={{ marginLeft: 'auto' }}
              >
                Siguiente: Curva y Calibración <IconArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 5: CURVA Y DETALLES DE SENSIBILIDAD                 */}
        {/* ======================================================== */}
        {activeStep === 5 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconCurve /></div>
              <div>
                <h4>Paso 5: Curva Bézier y Cinemática de Aim Assist</h4>
                <p className="faint">
                  Ajusta la curva de respuesta y zona muerta para que el movimiento del mouse mantenga la burbuja de asistencia rotacional activa.
                </p>
              </div>
              <span className="chip ok" style={{ marginLeft: 'auto' }}>
                <span className="dot" /> Curva Calibrada
              </span>
            </div>

            <div className="wizard-pane-card">
              <div className="grid grid-3" style={{ gap: 14 }}>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Sensibilidad General</span>
                  <strong>{s.config.sensitivity}x</strong>
                  <small className="faint">Multiplicador cinemático a 1000 Hz</small>
                </div>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Zona Muerta Interna</span>
                  <strong>{Math.round((s.config.deadzoneInner || 0.08) * 100)}%</strong>
                  <small className="faint">Elimina deriva mínima del stick</small>
                </div>
                <div className="wizard-summary-tile">
                  <span className="faint" style={{ fontSize: 12 }}>Exponente de Curva</span>
                  <strong>{s.config.exponent} (Bézier suave)</strong>
                  <small className="faint">Respuesta de Aim Assist rotacional</small>
                </div>
              </div>

              <div className="row-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p className="faint" style={{ margin: 0, fontSize: 13 }}>
                  Ajusta visualmente la curva exponencial, suavizado y aceleración de puntero.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onGo('curve')}
                >
                  <IconCurve /> Ajustar Curva y Sensibilidad
                </button>
              </div>
            </div>

            <div className="wizard-footer-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setActiveStep(4)}>
                Volver a Mapeo
              </button>
              <span className="row" style={{ marginLeft: 'auto', gap: 10, color: 'var(--accent)', fontWeight: 600 }}>
                <IconCheck /> ¡Perfil «{profile.name}» listo para jugar con Aim Assist!
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
