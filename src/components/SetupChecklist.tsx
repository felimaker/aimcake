import { useState, useMemo } from 'react';
import type { ControllerType, EngineStatus, InputDevice, Profile, SoftwarePackageId } from '../types';
import { checkProfile } from '../lib/profiles';
import { isMouseInput } from '../lib/keys';
import { bridge, isTauri } from '../services/tauriBridge';
import {
  IconArrowRight, IconCheck, IconCpu, IconCurve, IconDownload,
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

  // Estado del software e instalador
  const pkgs = status?.verification?.packages;
  const driverReady = !!status?.driverOk;
  const isInstalled = driverReady || Boolean(pkgs?.vigembus?.verified);

  // Estados de completitud de cada uno de los 5 pasos
  const stepCompleted: Record<StepNum, boolean> = {
    1: isInstalled,
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
        toast('success', 'Driver instalado y verificado con éxito en Windows.');
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
    { num: 1 as StepNum, title: 'Instalador (.exe)', label: 'aimcake_setup.exe', icon: <IconDownload /> },
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
        {/* PASO 1: INSTALADOR AIMCAKE (.EXE)                        */}
        {/* ======================================================== */}
        {activeStep === 1 && (
          <div className="wizard-pane animate-fade">
            <div className="wizard-pane-header">
              <div className="wizard-pane-icon"><IconDownload /></div>
              <div>
                <h4>Paso 1: Instalador Oficial AimCake (aimcake_setup.exe)</h4>
                <p className="faint">
                  Descarga y ejecuta el instalador único para activar tu Aim Assist a 1000 Hz con aislamiento de hardware en Windows.
                </p>
              </div>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                <span className={`chip ${isInstalled ? 'ok' : 'warn'}`}>
                  <span className="dot" />
                  {isInstalled ? 'Instalado y Verificado' : 'Pendiente de Instalación'}
                </span>
              </div>
            </div>

            {/* Tarjeta Única del Instalable aimcake_setup.exe */}
            <div className="wizard-pane-card" style={{ padding: 22 }}>
              <div className="row-between" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: 14,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    border: '1px solid hsl(142 88% 52% / 0.3)',
                    flexShrink: 0,
                  }}>
                    <IconDownload style={{ width: 24, height: 24 }} />
                  </div>
                  <div>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontSize: 16, color: 'var(--text)' }}>aimcake_setup.exe</strong>
                      <span className="chip ok xs">Instalador Completo</span>
                      <span className="faint" style={{ fontSize: 12 }}>~6.3 MB · Windows 10/11 (64-bit)</span>
                    </div>
                    <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>
                      Instalador único que incluye la aplicación AimCake, el driver de compatibilidad y los componentes de aislamiento de periféricos.
                    </p>
                  </div>
                </div>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <a
                    href="/downloads/aimcake_setup.exe"
                    download="aimcake_setup.exe"
                    className="btn btn-primary"
                    onClick={() => {
                      bridge.recordPackageDownload('vigembus');
                      onRefreshStatus();
                      toast('success', 'Descargando aimcake_setup.exe...');
                    }}
                  >
                    <IconDownload /> Descargar aimcake_setup.exe
                  </a>

                  <button
                    type="button"
                    className="btn"
                    onClick={handleRecheckDriver}
                    disabled={checkingDrivers}
                  >
                    {checkingDrivers ? <span className="spinner" /> : <IconRefresh />} Validar Instalación
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

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleToggleVerified('vigembus')}
                    title="Marcar manualmente si ya lo instalaste"
                  >
                    {isInstalled ? '✓ Marcar como verificado' : 'Marcar como instalado'}
                  </button>
                </div>
              </div>
            </div>

            {/* Acciones del pie */}
            <div className="wizard-footer-actions">
              <span className="faint" style={{ fontSize: 13 }}>
                Una vez instalado aimcake_setup.exe en Windows, pulsa siguiente para continuar configurando tu perfil.
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
                <p className="faint" style={{ fontSize: 12.5, margin: '4px 0 8px 0' }}>
                  Elige qué ratón apuntará con Aim Assist. Las demás fuentes quedan automáticamente aisladas:
                </p>

                <div className="stack" style={{ gap: 8 }}>
                  {devices.filter((d) => d.kind === 'mouse').map((d) => {
                    const isSelected = s.mice.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`wizard-opt-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleDeviceChange('mouse', d.id)}
                      >
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="wizard-opt-radio" />
                          <div style={{ textAlign: 'left' }}>
                            <strong>{d.name}</strong>
                            <div className="faint" style={{ fontSize: 11 }}>{d.connection || 'Conectado'}</div>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="chip xs ok">✓ Activo Aim Assist</span>
                        ) : (
                          <span className="chip xs" style={{ opacity: 0.75 }}>Aislado</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="wizard-device-status" style={{ marginTop: 10 }}>
                  {ms ? (
                    <div className="stack" style={{ gap: 2 }}>
                      <span className="row" style={{ gap: 6, color: 'var(--accent)', fontSize: 12 }}>
                        <IconCheck style={{ width: 13 }} /> {ms.name} asignado
                      </span>
                      <small className="faint" style={{ fontSize: 11 }}>
                        🛡️ Aislamiento 1:1 activo
                      </small>
                    </div>
                  ) : (
                    <span className="faint" style={{ color: 'var(--warn)' }}>⚠ Elige tu ratón arriba</span>
                  )}
                </div>
              </div>

              {/* 3. Teclado Exclusivo */}
              <div className="wizard-device-box">
                <div className="wizard-device-head">
                  <IconKeyboard style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                  <strong>3. Teclado Exclusivo</strong>
                </div>
                <p className="faint" style={{ fontSize: 12.5, margin: '4px 0 8px 0' }}>
                  Teclado para movimientos WASD y acciones en juego:
                </p>

                <div className="stack" style={{ gap: 8 }}>
                  {devices.filter((d) => d.kind === 'keyboard').map((d) => {
                    const isSelected = s.keyboards.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`wizard-opt-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleDeviceChange('keyboard', d.id)}
                      >
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="wizard-opt-radio" />
                          <div style={{ textAlign: 'left' }}>
                            <strong>{d.name}</strong>
                            <div className="faint" style={{ fontSize: 11 }}>{d.connection || 'Integrado'}</div>
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="chip xs ok">✓ Asignado</span>
                        ) : (
                          <span className="chip xs" style={{ opacity: 0.75 }}>Elegir</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="wizard-device-status" style={{ marginTop: 10 }}>
                  {kb ? (
                    <span className="row" style={{ gap: 6, color: 'var(--accent)', fontSize: 12 }}>
                      <IconCheck style={{ width: 13 }} /> {kb.name} asignado
                    </span>
                  ) : (
                    <span className="faint" style={{ color: 'var(--warn)' }}>⚠ Elige tu teclado arriba</span>
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
