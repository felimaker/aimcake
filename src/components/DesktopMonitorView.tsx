import { useEffect, useState } from 'react';
import type { EngineStatus, GamepadSnapshot, InputDevice, Profile } from '../types';
import type { AuthState } from '../hooks/useAuth';
import type { LicenseState } from '../hooks/useLicense';
import { controllerName } from '../lib/controllers';
import { bridge } from '../services/tauriBridge';
import {
  IconAlert, IconBolt, IconCheck, IconChevron, IconChip, IconCopy,
  IconCpu, IconDownload, IconGamepad, IconKeyboard, IconLayers,
  IconMouse, IconPause, IconPlay, IconPower, IconRefresh, IconShield, IconSpark,
  IconUser
} from './Icons';

interface Props {
  status: EngineStatus | null;
  running: boolean;
  busy: boolean;
  snapshot: GamepadSnapshot;
  profile: Profile;
  devices: InputDevice[];
  auth: AuthState;
  license: LicenseState;
  hwid: string;
  onToggle: () => Promise<void>;
  onTogglePause: () => void;
  onRefreshStatus: () => Promise<void>;
  onInstallDrivers: () => Promise<void>;
  onOpenWeb: () => void;
  onSwitchToFullEditor: () => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

export default function DesktopMonitorView({
  status,
  running,
  busy,
  snapshot,
  profile,
  devices,
  auth,
  license,
  hwid,
  onToggle,
  onTogglePause,
  onRefreshStatus,
  onInstallDrivers,
  onOpenWeb,
  onSwitchToFullEditor,
  toast,
}: Props) {
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [installingDrivers, setInstallingDrivers] = useState(false);
  const [lastActivity, setLastActivity] = useState<'mouse' | 'keyboard' | null>(null);

  const s = profile.settings;
  const kb = devices.find((d) => d.id === s.keyboards[0]);
  const ms = devices.find((d) => d.id === s.mice[0]);
  const isDriverOk = Boolean(status?.driverOk);

  // Escucha de actividad de periféricos para iluminar los badges
  useEffect(() => {
    let t: number;
    const unsub = bridge.onDeviceActivity((ev) => {
      setLastActivity(ev.kind);
      clearTimeout(t);
      t = window.setTimeout(() => setLastActivity(null), 300);
    });
    return () => {
      clearTimeout(t);
      unsub.then((off) => off());
    };
  }, []);

  // Atajo de teclado F12 para encender o apagar la emulación desde la app
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F12' || e.code === 'F12') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onToggle]);

  const copyHwid = () => {
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(true);
    toast('info', 'HWID copiado al portapapeles.');
    setTimeout(() => setCopiedHwid(false), 2500);
  };

  const handleInstallDrivers = async () => {
    setInstallingDrivers(true);
    try {
      await onInstallDrivers();
      toast('success', 'Drivers de AimCake instalados correctamente.');
    } catch (err: any) {
      toast('error', `Error al instalar drivers: ${err?.message || err}`);
    } finally {
      setInstallingDrivers(false);
    }
  };

  const handleHideToTray = () => {
    bridge.hideWindow().then(() => {
      toast('info', 'AimCake sigue activo en la bandeja del reloj.');
    }).catch(() => {
      toast('info', 'AimCake minimizado junto al reloj de Windows.');
    });
  };

  const remainingDays = license.payload?.expires_at
    ? Math.max(0, Math.ceil((license.payload.expires_at - Date.now() / 1000) / 86400))
    : 0;

  return (
    <div className="desk-monitor-shell">
      {/* Barra de cabecera HUD */}
      <header className="desk-monitor-head">
        <div className="desk-monitor-brand">
          <img src="/cake-icon.svg" alt="AimCake" className="desk-brand-logo" />
          <div>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="desk-brand-title">AimCake</span>
              <span className="badge badge-subtle">HUD Monitor</span>
            </div>
            <span className="desk-brand-sub">Windows 10/11 · 1000 Hz Professional</span>
          </div>
        </div>

        <div className="desk-monitor-actions">
          <div className="chip ok xs desk-tray-indicator" title="Ejecutándose en la bandeja junto al reloj">
            <span className="pulse-dot" />
            <span>En el reloj de Windows</span>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onSwitchToFullEditor}
            title="Abrir vista avanzada de perfiles y mapeo dentro de esta ventana"
          >
            <IconLayers />
            <span>Panel Completo</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-secondary desk-btn-tray"
            onClick={handleHideToTray}
            title="Ocultar ventana a la bandeja del sistema (junto al reloj)"
          >
            <span>Minimizar al Reloj</span>
            <span className="desk-key-hint">_</span>
          </button>
        </div>
      </header>

      {/* Hero Central: El Gran Interruptor de Encender / Apagar */}
      <section className={`card desk-power-card ${running ? 'is-active' : ''}`}>
        <div className="desk-power-glow" />

        <div className="desk-power-meta">
          <div className="desk-power-badge-row">
            <span className={`chip sm ${running ? 'ok' : ''}`}>
              <IconCpu />
              {running ? (snapshot.paused ? 'PAUSADO (TECLA HOTKEY)' : 'EMULANDO EN TIEMPO REAL') : 'EN ESPERA'}
            </span>
            <span className="chip sm">
              <IconBolt />
              1000 Hz / 0.1 ms
            </span>
            <span className="chip sm">
              <IconGamepad />
              {controllerName(s.controller || 'X360')}
            </span>
          </div>
          <span className="desk-shortcut-info">
            Atajo rápido: <kbd>F12</kbd> para alternar en plena partida
          </span>
        </div>

        <div className="desk-power-btn-wrap">
          <button
            id="desk-monitor-toggle-btn"
            type="button"
            disabled={busy || installingDrivers}
            onClick={onToggle}
            className={`desk-power-btn ${running ? 'on' : 'off'}`}
          >
            <div className="desk-power-icon-ring">
              {busy ? <span className="spinner" style={{ width: 38, height: 38 }} /> : <IconPower />}
            </div>
            <div className="desk-power-text">
              <span className="desk-power-action-title">
                {running ? 'APAGAR DISPOSITIVO VIRTUAL' : 'ENCENDER DISPOSITIVO VIRTUAL'}
              </span>
              <span className="desk-power-action-desc">
                {running
                  ? 'Aim Assist nativo activo con ratón y teclado · Pulsa para apagar'
                  : 'Pulsa para activar el Aim Assist de mando a 1000 Hz'}
              </span>
            </div>
          </button>
        </div>

        {running && (
          <div className="desk-power-controls-row">
            <button
              type="button"
              className={`btn btn-sm ${snapshot.paused ? 'btn-primary' : 'btn-ghost'}`}
              onClick={onTogglePause}
            >
              {snapshot.paused ? <IconPlay /> : <IconPause />}
              <span>{snapshot.paused ? 'Reanudar Aim Assist' : 'Pausar temporalmente'}</span>
            </button>
            <span className="faint" style={{ fontSize: 12 }}>
              Frecuencia de muestreo efectiva: <strong>{snapshot.hz} Hz</strong>
            </span>
          </div>
        )}

        {!isDriverOk && (
          <div className="alert warn desk-driver-alert">
            <IconAlert />
            <div className="row-between" style={{ width: '100%', alignItems: 'center' }}>
              <span>
                <strong>Se requieren los drivers certificados de AimCake</strong> para que Windows detecte el mando virtual.
              </span>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={installingDrivers}
                onClick={handleInstallDrivers}
              >
                {installingDrivers ? <span className="spinner" /> : <IconDownload />}
                <span>{installingDrivers ? 'Instalando...' : 'Instalar Drivers (1 clic)'}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Grid de Estado: Drivers, Periféricos y Telemetría */}
      <div className="desk-monitor-grid">
        {/* Telemetría de Periféricos */}
        <div className="card desk-tile">
          <div className="card-title">
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <IconGamepad style={{ color: 'var(--accent)' }} />
              Periféricos & Raw Input
            </span>
            <span className={`chip xs ${lastActivity ? 'ok' : ''}`}>
              {lastActivity ? `Actividad: ${lastActivity}` : 'Captura Win32 Activa'}
            </span>
          </div>

          <div className="desk-device-list">
            <div className={`desk-device-item ${lastActivity === 'mouse' ? 'active-ping' : ''}`}>
              <IconMouse className="desk-dev-icon" />
              <div className="desk-dev-body">
                <strong>{ms ? ms.name : 'Ratón no seleccionado'}</strong>
                <small>{ms ? `Protocolo Raw Input · ${ms.connection || 'USB 1000 Hz'}` : 'Selecciona un ratón en el configurador'}</small>
              </div>
              <span className={`chip xs ${ms ? 'ok' : 'warn'}`}>{ms ? 'Detectado' : 'Falta'}</span>
            </div>

            <div className={`desk-device-item ${lastActivity === 'keyboard' ? 'active-ping' : ''}`}>
              <IconKeyboard className="desk-dev-icon" />
              <div className="desk-dev-body">
                <strong>{kb ? kb.name : 'Teclado no seleccionado'}</strong>
                <small>{kb ? `Captura directa de teclas · ${kb.connection || 'USB'}` : 'Selecciona un teclado en el configurador'}</small>
              </div>
              <span className={`chip xs ${kb ? 'ok' : 'warn'}`}>{kb ? 'Detectado' : 'Falta'}</span>
            </div>
          </div>
        </div>

        {/* Drivers Oficiales */}
        <div className="card desk-tile">
          <div className="card-title">
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <IconChip style={{ color: 'var(--accent-2)' }} />
              Drivers de Windows
            </span>
            <span className={`chip xs ${isDriverOk ? 'ok' : 'warn'}`}>
              {isDriverOk ? 'WHQL Certificado' : 'Acción requerida'}
            </span>
          </div>

          <div className="desk-driver-details">
            <div className="desk-driver-row">
              <div>
                <strong>Driver Virtual ViGEmBus</strong>
                <small>Emulador de hardware certificado por Microsoft WHQL para Windows 10/11</small>
              </div>
              <span className={`chip xs ${isDriverOk ? 'ok' : 'danger'}`}>
                {isDriverOk ? <><IconCheck /> Instalado</> : 'No instalado'}
              </span>
            </div>

            <div className="desk-driver-row">
              <div>
                <strong>Latencia de bus</strong>
                <small>Transferencia directa a kernel Win32</small>
              </div>
              <span className="chip xs ok">0.1 ms</span>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={onRefreshStatus}
                title="Comprobar estado de drivers"
              >
                <IconRefresh />
                <span>Verificar</span>
              </button>

              {!isDriverOk && (
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={handleInstallDrivers}
                  disabled={installingDrivers}
                >
                  <IconDownload />
                  <span>Instalar driver</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cuenta y Licencia */}
        <div className="card desk-tile">
          <div className="card-title">
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <IconShield style={{ color: 'var(--accent)' }} />
              Cuenta & Licencia
            </span>
            <span className="chip xs ok">
              {remainingDays > 0 ? `${remainingDays} días activos` : 'Licencia requerida'}
            </span>
          </div>

          <div className="desk-account-details">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <div className="desk-user-avatar">
                <IconUser />
              </div>
              <div>
                <strong style={{ fontSize: 13.5 }}>{auth.user?.email || 'Usuario AimCake'}</strong>
                <small className="faint" style={{ display: 'block' }}>
                  {auth.user?.phone ? `Móvil: ${auth.user.phone} · ` : ''}
                  {license.payload ? 'Licencia Pro Verificada' : 'Prueba de 3 días'}
                </small>
              </div>
            </div>

            <div className="desk-hwid-box">
              <span className="faint" style={{ fontSize: 11 }}>HWID del PC:</span>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <code>{hwid ? `${hwid.slice(0, 14)}…${hwid.slice(-6)}` : 'Detectando...'}</code>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={copyHwid}
                  title="Copiar HWID"
                >
                  {copiedHwid ? <IconCheck style={{ color: 'var(--accent)' }} /> : <IconCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Acceso a la Configuración Web */}
        <div className="card desk-tile desk-tile-web">
          <div className="card-title">
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <IconSpark style={{ color: '#f59e0b' }} />
              Configurador en el Navegador
            </span>
            <span className="chip xs" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
              Sincronización Cloud
            </span>
          </div>

          <p className="faint" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>
            Toda la calibración avanzada de curvas Bézier, zonas muertas y mapeo de teclas se personaliza
            cómodamente desde la web y se aplica al instante a este equipo.
          </p>

          <button
            id="desk-open-web-btn"
            type="button"
            className="btn btn-primary btn-block"
            onClick={onOpenWeb}
          >
            <span>Abrir Configurador en el Navegador</span>
            <IconChevron style={{ transform: 'rotate(-90deg)', width: 14 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
