import { useState } from 'react';
import type { EngineStatus, InputDevice, Profile } from '../types';
import { bridge, isTauri } from '../services/tauriBridge';
import { controllerName } from '../lib/controllers';
import {
  IconArrowRight, IconCheck, IconCpu, IconCurve, IconDownload,
  IconGamepad, IconKeyboard, IconLayers, IconRefresh, IconSpark
} from './Icons';

export type StepNum = 1 | 2 | 3 | 4 | 5;
type GoView = 'devices' | 'mapping' | 'curve' | 'profiles';

interface Props {
  status: EngineStatus | null;
  profile: Profile;
  devices: InputDevice[];
  onRefreshStatus: () => Promise<void>;
  onGo: (view: GoView) => void;
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

interface Row {
  num: StepNum;
  title: string;
  summary: string;
  done: boolean;
  optional?: boolean;
  icon: JSX.Element;
  cta: string;
  go?: GoView;
}

/** Panel = lista de verificación. Cada paso se configura en su propio módulo. */
export default function SetupChecklist({ status, profile, devices, onRefreshStatus, onGo, toast }: Props) {
  const s = profile.settings;

  const kb = devices.find((d) => d.id === s.keyboards[0]);
  const ms = devices.find((d) => d.id === s.mice[0]);
  const kbStale = s.keyboards.length > 0 && !kb;
  const msStale = s.mice.length > 0 && !ms;

  const isInstalled = !!status?.driverOk || Boolean(status?.verification?.packages?.vigembus?.verified);

  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const devicesDone = !!s.controller && !!kb && !!ms;
  const devicesSummary = devicesDone
    ? `${controllerName(s.controller!)} · ${ms!.name} · ${kb!.name}`
    : [
        !s.controller ? 'Falta protocolo' : null,
        !ms ? (msStale ? 'Ratón desconectado' : 'Falta ratón') : null,
        !kb ? (kbStale ? 'Teclado desconectado' : 'Falta teclado') : null,
      ].filter(Boolean).join(' · ');

  const rows: Row[] = [
    {
      num: 1, title: 'Instalar AimCake', done: isInstalled, icon: <IconDownload />,
      summary: isInstalled ? 'Instalado y verificado en este equipo' : 'Descarga e instala aimcake_setup.exe (necesario para la conexión)',
      cta: '',
    },
    {
      num: 2, title: 'Perfil', done: profile.name.trim().length > 0, icon: <IconLayers />,
      summary: `«${profile.name}»${profile.game ? ` · ${profile.game}` : ' · sin juego asignado'}`,
      cta: 'Abrir Perfiles', go: 'profiles',
    },
    {
      num: 3, title: 'Dispositivos', done: devicesDone, icon: <IconGamepad />,
      summary: devicesSummary, cta: 'Abrir Dispositivos', go: 'devices',
    },
    {
      num: 4, title: 'Mapeo', done: s.bindings.length > 0, icon: <IconKeyboard />,
      summary: s.bindings.length > 0 ? `${s.bindings.length} asignaciones guardadas en este perfil` : 'Aún no hay teclas asignadas',
      cta: 'Abrir Mapeo', go: 'mapping',
    },
    {
      num: 5, title: 'Curva', done: true, optional: true, icon: <IconCurve />,
      summary: `Sensibilidad ${s.config.sensitivity}x · exponente ${s.config.exponent} (valores recomendados, ajuste opcional)`,
      cta: 'Abrir Curva', go: 'curve',
    },
  ];

  const required = rows.filter((r) => !r.optional);
  const doneCount = required.filter((r) => r.done).length;
  const next = rows.find((r) => !r.done);
  const allReady = doneCount === required.length;

  const recheck = async () => {
    setChecking(true);
    try {
      await onRefreshStatus();
      toast('info', 'Comprobación de instalación actualizada.');
    } finally {
      setChecking(false);
    }
  };

  const installAuto = async () => {
    setInstalling(true);
    try {
      const res = await bridge.installDriver();
      await onRefreshStatus();
      if (res.driverOk) toast('success', 'Instalación verificada con éxito.');
      else if (res.rebootRequired) toast('info', 'Instalación completa. Windows requiere reiniciar el equipo.');
      else if (res.cancelled) toast('info', 'Instalación cancelada.');
      else toast('error', `Error en la instalación (código ${res.exitCode}).`);
    } catch (e: any) {
      toast('error', `Error al instalar: ${e?.message || e}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="card setup-wizard-card">
      <div className="wizard-top-bar">
        <div className="wizard-title-group">
          <div className="wizard-badge-icon">
            <IconSpark style={{ width: 20, height: 20, color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Lista de configuración</h3>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {allReady ? '¡Todo listo! Pulsa ACTIVAR para jugar.' : `Siguiente: ${next?.title} — cada paso se configura en su módulo`}
            </span>
          </div>
        </div>
        <div className="wizard-progress-pill">
          <div className="wizard-progress-fill" style={{ width: `${(doneCount / required.length) * 100}%` }} />
          <span>{doneCount}/{required.length} completados</span>
        </div>
      </div>

      <ol className="check-list">
        {rows.map((r) => {
          const isNext = next?.num === r.num;
          return (
            <li key={r.num} className={`check-row ${r.done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <div className="check-row-main">
                <span className="check-circle">{r.done ? <IconCheck style={{ width: 15, height: 15 }} /> : r.num}</span>
                <div className="check-text">
                  <strong>
                    {r.title}
                    {r.optional && <em className="check-opt">Opcional</em>}
                  </strong>
                  <small className={r.done || r.optional ? 'faint' : 'warn-text'}>{r.summary}</small>
                </div>
                {r.go && (
                  <button
                    type="button"
                    id={`check-go-${r.num}`}
                    className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => onGo(r.go!)}
                  >
                    {r.done && !isNext ? 'Revisar' : r.cta} <IconArrowRight />
                  </button>
                )}
                {r.num === 1 && isInstalled && (
                  <a href="/downloads/aimcake_setup.exe" download="aimcake_setup.exe" className="btn btn-sm btn-ghost">
                    <IconDownload /> Reinstalar
                  </a>
                )}
              </div>

              {r.num === 1 && (
                <div className="check-install" style={{ marginTop: 12 }}>
                  <div className="row-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      Instalador oficial para Windows 10 y 11 (64-bit) · Mando Virtual 1000 Hz
                    </div>
                    <span className={`chip xs ${isInstalled ? 'ok' : 'warn'}`}>
                      {isInstalled ? '✅ Instalado y Listo' : '⚠️ Pendiente de instalar'}
                    </span>
                  </div>

                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    {!isInstalled ? (
                      <>
                        <a
                          id="panel-download-exe"
                          href="/downloads/aimcake_setup.exe"
                          download="aimcake_setup.exe"
                          className="btn btn-primary"
                          onClick={() => {
                            bridge.recordPackageDownload('vigembus');
                            onRefreshStatus();
                            toast('success', 'Descargando instalador de AimCake…');
                          }}
                        >
                          <IconDownload /> 1. Descargar aimcake_setup.exe
                        </a>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={recheck}
                          disabled={checking}
                          title="Haz clic aquí después de ejecutar el instalador en tu equipo"
                        >
                          {checking ? <span className="spinner" /> : <IconRefresh />} 2. Ya lo instalé · Verificar
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          id="panel-open-app"
                          href="aimcake://launch"
                          className="btn btn-primary"
                          title="Abre la app de AimCake instalada en tu equipo"
                        >
                          <IconGamepad /> Abrir AimCake en Windows
                        </a>

                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={recheck}
                          disabled={checking}
                        >
                          {checking ? <span className="spinner" /> : <IconRefresh />} Volver a comprobar
                        </button>

                        <a
                          href="/downloads/aimcake_setup.exe"
                          download="aimcake_setup.exe"
                          className="btn btn-sm btn-ghost faint"
                          title="Volver a descargar el instalador si necesitas reinstalarlo"
                        >
                          <IconDownload /> Descargar de nuevo
                        </a>
                      </>
                    )}

                    {isTauri && (
                      <button type="button" className="btn btn-ghost" onClick={installAuto} disabled={installing}>
                        {installing ? <span className="spinner" /> : <IconCpu />} Instalar drivers en 1 clic
                      </button>
                    )}
                  </div>

                  {/* Pasos súper sencillos para el usuario */}
                  <div style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-dim)'
                  }}>
                    <span className="chip sm" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <strong>Paso 1:</strong> Descarga el archivo
                    </span>
                    <span className="chip sm" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <strong>Paso 2:</strong> Ábrelo y dale a Instalar (15 seg)
                    </span>
                    <span className="chip sm ok" style={{ background: 'rgba(34,197,94,0.1)' }}>
                      <strong>Paso 3:</strong> ¡Listo! Abre el icono del reloj y pulsa Encender
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
