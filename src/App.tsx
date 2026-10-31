import { useCallback, useEffect, useRef, useState } from 'react';
import AccountView, { AuthPanel, EmailVerificationBarrier } from './components/AccountView';
import CurveTuner from './components/CurveTuner';
import DevicesView from './components/DevicesView';
import LiveController from './components/LiveController';
import MappingView from './components/MappingView';
import ProfilesView, { type EditTarget } from './components/ProfilesView';
import SetupChecklist from './components/SetupChecklist';
import SuperAdminView from './components/SuperAdminView';
import LandingPage from './components/LandingPage';
import DesktopRequiredBanner from './components/DesktopRequiredBanner';
import LicenseStatus, { formatRemaining } from './components/LicenseStatus';
import {
  IconAlert, IconBolt, IconCheck, IconChevron, IconChip, IconCrown, IconCurve, IconDashboard, IconDevices, IconDownload, IconEdit,
  IconGamepad, IconKeyboard, IconLayers, IconMouse, IconPause, IconPlay, IconPower, IconShield, IconSpark, IconUser,
} from './components/Icons';
import { useAuth } from './hooks/useAuth';
import { useLicense } from './hooks/useLicense';
import { controllerName } from './lib/controllers';
import { DEFAULT_SETTINGS } from './lib/curve';
import { keyName } from './lib/keys';
import { checkProfile, loadStore, missingText, REQUIREMENT_TEXT, REQUIREMENTS, saveStore } from './lib/profiles';
import { bridge, isTauri } from './services/tauriBridge';
import type { ControllerType, EngineSettings, EngineStatus, GamepadSnapshot, InputDevice, Profile, ProfileStore } from './types';
import { EMPTY_SNAPSHOT } from './types';

type View = 'landing' | 'dashboard' | 'profiles' | 'mapping' | 'curve' | 'devices' | 'license' | 'account' | 'superadmin';

interface Toast { id: number; kind: 'error' | 'success' | 'info'; text: string }

/* ------------------------------------------------------------------ */
/* Selector de perfil de la barra lateral                               */
/* ------------------------------------------------------------------ */
function ProfileSwitcher({ store, onActivate, onManage }: { store: ProfileStore; onActivate: (id: string) => void; onManage: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];
  const activeCheck = checkProfile(active);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="pswitch" ref={ref}>
      <span className="pswitch-label">Perfil activo</span>
      <button id="profile-switcher" className={`pswitch-btn ${open ? 'open' : ''}`} style={{ ['--pc' as string]: active.color }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pswitch-dot" />
        <span className="pswitch-text">
          <strong>{active.name}</strong>
          <small className={activeCheck.complete ? '' : 'warn'}>{activeCheck.complete ? (active.game || `${active.settings.bindings.length} asignaciones`) : `Incompleto · ${activeCheck.done}/${activeCheck.total}`}</small>
        </span>
        <IconChevron className="pswitch-chev" />
      </button>
      {open && (
        <div className="pswitch-menu" role="listbox">
          {store.profiles.map((p) => {
            const c = checkProfile(p);
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={p.id === active.id}
                aria-disabled={!c.complete}
                className={`pswitch-item ${p.id === active.id ? 'on' : ''} ${c.complete ? '' : 'locked'}`}
                style={{ ['--pc' as string]: p.color }}
                title={c.complete ? undefined : missingText(c)}
                onClick={() => { onActivate(p.id); setOpen(false); }}
              >
                <span className="pswitch-dot" />
                <span className="pswitch-text"><strong>{p.name}</strong><small>{c.complete ? (p.game || `${p.settings.bindings.length} asignaciones`) : `Incompleto · ${c.done}/${c.total}`}</small></span>
                {!c.complete && <span className="pswitch-lock">Configurar</span>}
              </button>
            );
          })}
          <button className="pswitch-manage" onClick={() => { onManage(); setOpen(false); }}><IconLayers /> Gestionar perfiles</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
  const [bypassDesktopReq, setBypassDesktopReq] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | undefined>();
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [hwid, setHwid] = useState('');
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<GamepadSnapshot>(EMPTY_SNAPSHOT);
  const [store, setStore] = useState<ProfileStore | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const license = useLicense(hwid);
  const auth = useAuth();
  const now = Date.now() / 1000;

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const requireAuth = useCallback((reason?: string, mode: 'login' | 'register' = 'register') => {
    setAuthNotice(reason ?? 'Inicia sesión o crea tu cuenta gratuita para acceder.');
    setAuthInitialMode(mode);
    setView('account');
  }, []);

  const activeProfile = store ? store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0] : null;
  /** Perfil que se está editando en Mapeo / Curva / Dispositivos (puede no ser el activo). */
  const editProfile = store ? store.profiles.find((p) => p.id === editingId) ?? activeProfile : null;
  const settings: EngineSettings = activeProfile?.settings ?? DEFAULT_SETTINGS;
  const editSettings: EngineSettings = editProfile?.settings ?? DEFAULT_SETTINGS;
  const activeCheck = activeProfile ? checkProfile(activeProfile, devices) : null;

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Inicialización
  useEffect(() => {
    bridge.getHwid().then(setHwid).catch((e) => toast('error', `HWID: ${e}`));
    bridge.getStatus().then((s) => { setStatus(s); setRunning(s.running); }).catch(() => {});
    loadStore().then(setStore);
    const loadDevices = () => bridge.listDevices().then(setDevices).catch(() => {});
    loadDevices();
    const offs: Promise<() => void>[] = [
      bridge.onGamepadState(setSnapshot),
      bridge.onEngineStopped((reason) => {
        setRunning(false);
        setSnapshot(EMPTY_SNAPSHOT);
        if (reason !== 'Emulación detenida') toast('error', reason);
      }),
      bridge.onDevicesChanged(loadDevices),
    ];
    return () => { offs.forEach((p) => p.then((off) => off())); };
  }, [toast]);

  // Persistir perfiles (con debounce) cada vez que cambian.
  const saveTimer = useRef<number>();
  const loaded = useRef(false);
  useEffect(() => {
    if (!store) return;
    if (!loaded.current) { loaded.current = true; saveStore(store).catch(() => {}); return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveStore(store).catch((e) => toast('error', `No se pudieron guardar los perfiles: ${e}`));
    }, 300);
  }, [store, toast]);

  // Sincronizar los ajustes del perfil activo con el motor.
  const syncTimer = useRef<number>();
  useEffect(() => {
    if (!store) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      bridge.updateSettings(settings).catch((e) => toast('error', `Ajustes: ${e}`));
    }, 60);
  }, [settings, store, toast]);

  /* ---------------- Operaciones sobre perfiles ---------------- */
  const setEditSettings = useCallback((next: EngineSettings) => {
    setStore((st) => {
      if (!st) return st;
      const target = st.profiles.some((p) => p.id === editingId) ? editingId : st.activeId;
      return { ...st, profiles: st.profiles.map((p) => (p.id === target ? { ...p, settings: next, updatedAt: Date.now() } : p)) };
    });
  }, [editingId]);

  /** Modifica los ajustes del perfil ACTIVO (lo usa la checklist del Panel). */
  const setActiveController = useCallback((c: ControllerType) => {
    setStore((st) => st && {
      ...st,
      profiles: st.profiles.map((p) => (p.id === st.activeId ? { ...p, settings: { ...p.settings, controller: c }, updatedAt: Date.now() } : p)),
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await bridge.getStatus();
    setStatus(s);
  }, []);

  const editProfileIn = useCallback((id: string, target: EditTarget) => {
    setEditingId(id);
    setView(target);
  }, []);

  const activate = useCallback((id: string) => {
    const p = store?.profiles.find((x) => x.id === id);
    if (!p) return;
    const c = checkProfile(p);
    if (!c.complete) {
      toast('error', `«${p.name}» no se puede activar. ${missingText(c)}.`);
      setEditingId(id);
      setView('profiles');
      return;
    }
    setStore((st) => st && { ...st, activeId: id });
    setEditingId(id);
    toast('success', `Perfil «${p.name}» activado`);
  }, [store, toast]);

  const upsert = useCallback((p: Profile) => {
    setStore((st) => st && { ...st, profiles: st.profiles.map((x) => (x.id === p.id ? p : x)) });
  }, []);

  const addProfiles = useCallback((list: Profile[], activateFirst = false) => {
    setStore((st) => st && { ...st, profiles: [...st.profiles, ...list], activeId: activateFirst ? list[0].id : st.activeId });
    if (list.length === 1) setEditingId(list[0].id);
  }, []);

  const removeProfile = useCallback((id: string) => {
    setStore((st) => {
      if (!st || st.profiles.length <= 1 || st.activeId === id) return st;
      return { ...st, profiles: st.profiles.filter((p) => p.id !== id) };
    });
    setEditingId((e) => (e === id ? null : e));
  }, []);

  const licensed = !!license.payload && license.payload.expires_at > now;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (running) {
        await bridge.stop();
        setRunning(false);
        setSnapshot(EMPTY_SNAPSHOT);
      } else {
        if (status && !status.driverOk) {
          setView('dashboard');
          throw new Error('Faltan los drivers necesarios de AimCake. Instálalos desde Panel → paso 1 de la lista de configuración.');
        }
        if (activeCheck && !activeCheck.complete) {
          setEditingId(activeProfile!.id);
          setView('profiles');
          throw new Error(`El perfil «${activeProfile!.name}» está incompleto. ${missingText(activeCheck)}.`);
        }
        if (!license.token) { setView('license'); throw new Error('Necesitas una licencia o prueba activa para iniciar.'); }
        await bridge.updateSettings(settings);
        const msg = await bridge.start(license.token.payload, license.token.signature);
        setRunning(true);
        toast('success', msg);
      }
    } catch (e) {
      toast('error', String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
      bridge.getStatus().then(setStatus).catch(() => {});
    }
  };

  const togglePause = () => bridge.setPaused(!snapshot.paused);

  const NAV: { id: View; label: string; icon: JSX.Element; badge?: string }[] = [
    { id: 'dashboard', label: 'Panel', icon: <IconDashboard /> },
    { id: 'profiles', label: 'Perfiles', icon: <IconLayers />, badge: activeCheck && !activeCheck.complete ? '!' : undefined },
    { id: 'mapping', label: 'Mapeo', icon: <IconGamepad /> },
    { id: 'curve', label: 'Curva', icon: <IconCurve /> },
    { id: 'devices', label: 'Dispositivos', icon: <IconDevices /> },
    { id: 'license', label: 'Licencia', icon: <IconShield /> },
    { id: 'account', label: 'Cuenta', icon: <IconUser /> },
    ...(auth.user?.isSuper ? [{ id: 'superadmin' as View, label: 'SuperAdmin', icon: <IconCrown style={{ color: '#f59e0b' }} />, badge: 'SUPER' }] : []),
    { id: 'landing', label: 'Web Oficial', icon: <IconSpark />, badge: 'WEB' },
  ];

  const TITLES: Record<View, [string, string]> = {
    landing: ['AimCake · Web Oficial', 'Landing page comercial, características, telemetría y descargas'],
    dashboard: ['Panel de Control · AimCake', 'Completa la lista de configuración y empieza a jugar con asistencia 1000 Hz'],
    profiles: ['Perfiles', 'Cada perfil une mando, teclado, ratón y mapeo: los cuatro son obligatorios para activarlo'],
    mapping: ['Mapeo de controles', 'Asigna teclas y botones del ratón directamente sobre el mando'],
    curve: ['Curva de respuesta', 'Ajusta cómo se traduce el ratón al stick'],
    devices: ['Dispositivos', 'Elige el mando a emular, un teclado y un ratón'],
    license: ['Licencia y suscripción', 'Prueba gratuita de 3 días por equipo · Suscripción con Stripe'],
    account: ['Cuenta AimCake', 'Gestiona tu acceso: correo, contraseña y Google vinculados a una misma cuenta'],
    superadmin: ['Consola SuperAdmin', 'Gestión global de usuarios registrados, monitoreo de licencias y días de suscripción'],
  };

  const hzFraction = Math.min(snapshot.hz / settings.pollingHz, 1);
  const devName = (ids: string[]) =>
    ids.length === 0 ? 'Sin seleccionar' : devices.find((d) => d.id === ids[0])?.name ?? 'Dispositivo desconectado';

  if (auth.loading || !store || !activeProfile || !editProfile || !activeCheck) {
    return <div className="boot"><span className="spinner" style={{ width: 34, height: 34, borderWidth: 3, color: 'var(--accent)' }} /></div>;
  }

  const editsOther = editProfile.id !== activeProfile.id;
  const isEditView = view === 'mapping' || view === 'curve' || view === 'devices';
  const editCheck = checkProfile(editProfile, devices);

  // 1. Ruta pública: Landing page comercial (accesible por todos)
  if (view === 'landing') {
    return (
      <LandingPage
        user={auth.user}
        onGoApp={() => setView('dashboard')}
        onGoLogin={() => { setAuthNotice(undefined); setAuthInitialMode('login'); setView('account'); }}
        onGoRegister={() => { setAuthNotice(undefined); setAuthInitialMode('register'); setView('account'); }}
        onRequireAuth={(msg) => requireAuth(msg, 'register')}
      />
    );
  }

  // 2. Protección estricta: Todos los módulos requieren una sesión iniciada.
  if (!auth.user) {
    return (
      <div className="auth-lock-wrap">
        <AuthPanel
          auth={auth}
          initialMode={authInitialMode}
          bannerNotice={authNotice}
          onGoLanding={() => { setAuthNotice(undefined); setView('landing'); }}
        />
      </div>
    );
  }

  // 3. Verificación obligatoria de correo: Las cuentas con email y contraseña deben confirmar su correo
  if (!auth.user.emailConfirmed) {
    return (
      <div className="auth-lock-wrap">
        <EmailVerificationBarrier auth={auth} onGoLanding={() => setView('landing')} />
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" onClick={() => setView('dashboard')} style={{ cursor: 'pointer' }} title="AimCake Home">
          <img src="/cake-icon.svg" alt="Logotipo de AimCake" style={{ borderRadius: 10 }} />
          <div>
            <div className="brand-name">AimCake</div>
            <div className="brand-sub">Aim Assist · 1000 Hz</div>
          </div>
        </div>
        <ProfileSwitcher store={store} onActivate={activate} onManage={() => setView('profiles')} />
        <nav className="stack" style={{ gap: 4 }}>
          {NAV.map((n) => (
            <button key={n.id} id={`nav-${n.id}`} className={`nav-btn ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)}>
              {n.icon}{n.label}
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`chip ${running ? (snapshot.paused ? 'warn' : 'ok') : ''}`}>
            <span className="dot" />{running ? (snapshot.paused ? 'En pausa' : 'Emulando') : 'Detenido'}
          </span>
          <span className={`chip ${licensed ? (license.payload?.status === 'active' ? 'ok' : 'warn') : 'bad'}`}>
            <span className="dot" />
            {licensed ? (license.payload?.status === 'active' ? 'Pro' : `Prueba · ${formatRemaining(license.payload!.expires_at - now)}`) : 'Sin licencia'}
          </span>
          <button id="sidebar-account" className={`user-chip ${view === 'account' ? 'active' : ''}`} onClick={() => setView('account')}>
            {auth.user ? (
              <>
                <span className="user-chip-avatar">
                  {auth.user.avatarUrl ? <img src={auth.user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : auth.user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-chip-text"><strong>{auth.user.name}</strong><small>{auth.user.email}</small></span>
              </>
            ) : (
              <>
                <span className="user-chip-avatar empty"><IconUser /></span>
                <span className="user-chip-text"><strong>Iniciar sesión</strong><small>Correo o Google</small></span>
              </>
            )}
          </button>
          <a
            id="sidebar-download-exe"
            href="/downloads/aimcake_drivers.exe"
            download="aimcake_drivers.exe"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: 11.5, gap: 6, justifyContent: 'center' }}
            title="Descarga el instalador oficial de drivers de AimCake para Windows"
          >
            <IconDownload /> Descargar aimcake_drivers.exe
          </a>
          {!isTauri && <span className="faint" style={{ fontSize: 11.5 }}>Vista previa en navegador (motor simulado)</span>}
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <h1 className="page-title">{TITLES[view][0]}</h1>
            <p className="page-sub">{TITLES[view][1]}</p>
          </div>
          {view !== 'dashboard' && view !== 'account' && (
            <div className="row">
              {view !== 'profiles' && view !== 'license' && (
                <span className={`chip ${editsOther ? 'warn' : ''}`} style={{ ['--pc' as string]: editProfile.color }} title={editsOther ? 'Estás editando un perfil que no es el activo' : undefined}>
                  <span className="dot" style={{ background: editProfile.color }} />{editsOther ? 'Editando: ' : ''}{editProfile.name}
                </span>
              )}
              <button id="header-toggle" className={`btn ${running ? 'btn-danger' : 'btn-primary'}`} onClick={toggle} disabled={busy}>
                {busy ? <span className="spinner" /> : <IconPower />}{running ? 'Detener' : 'Iniciar'}
              </button>
            </div>
          )}
        </header>

        {isEditView && (editsOther || !editCheck.complete) && (
          <div className={`edit-banner ${editCheck.complete ? '' : 'warn'}`} style={{ ['--pc' as string]: editProfile.color }}>
            <span className="edit-banner-dot" />
            <div className="edit-banner-text">
              <strong>{editsOther ? <>Editando «{editProfile.name}» · no es el perfil activo</> : <>«{editProfile.name}» está incompleto</>}</strong>
              <span>
                {REQUIREMENTS.map((r) => (
                  <em key={r} className={editCheck[r] ? 'ok' : ''}>{editCheck[r] ? <IconCheck /> : <IconAlert />}{REQUIREMENT_TEXT[r].title}</em>
                ))}
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {editsOther && editCheck.complete && <button className="btn btn-sm btn-primary" onClick={() => activate(editProfile.id)}>Activar este perfil</button>}
              {editsOther && <button className="btn btn-sm" onClick={() => setEditingId(activeProfile.id)}>Editar el activo</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => setView('profiles')}><IconLayers /> Perfiles</button>
            </div>
          </div>
        )}

        <div className="view" key={view}>
          {!isDesktop && !bypassDesktopReq && (view === 'dashboard' || view === 'mapping' || view === 'curve' || view === 'devices' || view === 'profiles') ? (
            <DesktopRequiredBanner
              onGoAccount={() => setView('account')}
              onGoLanding={() => setView('landing')}
              onBypass={() => setBypassDesktopReq(true)}
            />
          ) : (
            <>
              {view === 'dashboard' && (
            <div className="stack" style={{ gap: 18 }}>
              <SetupChecklist
                status={status}
                profile={activeProfile}
                devices={devices}
                onRefreshStatus={refreshStatus}
                onSetController={setActiveController}
                onGo={(v) => { setEditingId(activeProfile.id); setView(v); }}
                toast={toast}
              />
              {status?.captureError && (
                <div className="alert error"><IconAlert /><span>Captura de entrada no disponible: {status.captureError}</span></div>
              )}
              <div className="grid grid-hero">
                <section className="card power-card">
                  <div className="card-title" style={{ alignSelf: 'stretch' }}>
                    <span>Emulador virtual</span>
                    <span className={`chip ${running ? 'ok' : ''}`}><span className="dot" />{running ? 'ONLINE' : 'OFFLINE'}</span>
                  </div>
                  <button id="power-toggle" className={`power ${running ? 'on' : ''}`} onClick={toggle} disabled={busy} aria-label={running ? 'Detener emulador' : 'Iniciar emulador virtual'}>
                    <span className="power-ring" />
                    {busy ? <span className="spinner" style={{ width: 40, height: 40, borderWidth: 3, color: 'var(--accent)' }} /> : <IconPower className="power-icon" />}
                    <span className="power-label">{running ? 'ACTIVO' : 'INICIAR'}</span>
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: 19 }}>{running ? `${controllerName(settings.controller)} conectado` : activeCheck.complete ? 'Listo para emular' : 'Perfil incompleto'}</h2>
                    <p className="faint" style={{ margin: '6px 0 0' }}>
                      {running
                        ? <>Pulsa <span className="keycap" style={{ padding: '2px 7px' }}>{keyName(settings.pauseHotkey)}</span> para pausar sin desconectar</>
                        : !activeCheck.complete ? 'Sigue la lista de configuración de arriba'
                          : licensed ? 'Pulsa el botón para conectar el mando virtual' : 'Activa tu licencia o prueba gratuita para empezar'}
                    </p>
                  </div>
                  {running && (
                    <button id="pause-toggle" className="btn btn-sm" onClick={togglePause}>
                      {snapshot.paused ? <><IconPlay /> Reanudar</> : <><IconPause /> Pausar</>}
                    </button>
                  )}
                  <button id="power-profile" className="power-profile" style={{ ['--pc' as string]: activeProfile.color }} onClick={() => setView('profiles')}>
                    <span className="pswitch-dot" />
                    <span className="power-profile-text">
                      <strong>{activeProfile.name}</strong>
                      <small><IconGamepad /> {settings.controller ? controllerName(settings.controller) : 'Mando sin elegir'}</small>
                      <small><IconKeyboard /> {devName(settings.keyboards)}</small>
                      <small><IconMouse /> {devName(settings.mice)}</small>
                    </span>
                    <span className={`power-profile-state ${activeCheck.complete ? 'ok' : 'warn'}`}>{activeCheck.complete ? <IconCheck /> : `${activeCheck.done}/${activeCheck.total}`}</span>
                  </button>
                </section>

                <section className="card lc-card">
                  <div className="card-title">
                    <span>Mando virtual en vivo</span>
                    <span className="row" style={{ gap: 8 }}>
                      {running && <span className="chip mono">{Math.round(snapshot.hz)} Hz</span>}
                      <span className={`chip ${running ? (snapshot.paused ? 'warn' : 'ok') : ''}`}><span className="dot" />{running ? (snapshot.paused ? 'Pausado' : (settings.controller === 'DS4' ? 'DS4 · Jugador 1' : 'XInput · Jugador 1')) : 'Sin señal'}</span>
                    </span>
                  </div>
                  <LiveController state={snapshot} connected={running} mouseStick={settings.mouseTarget} />
                </section>
              </div>

              <div className="grid grid-3">
                <section className="card stat">
                  <span className="stat-label row"><IconBolt style={{ width: 15, color: 'var(--accent)' }} /> Frecuencia real</span>
                  <span className="stat-value">{running ? Math.round(snapshot.hz) : 0}<small>/ {settings.pollingHz} Hz</small></span>
                  <div className="hz-bar"><div style={{ width: `${running ? hzFraction * 100 : 0}%` }} /></div>
                </section>
                <section className="card stat">
                  <span className="stat-label row"><IconChip style={{ width: 15, color: 'var(--accent-2)' }} /> Drivers de AimCake</span>
                  <span className="stat-value" style={{ color: status?.driverOk ? 'var(--accent)' : 'var(--danger)' }}>
                    {status ? (status.driverOk ? 'Instalados' : 'No encontrados') : '…'}
                  </span>
                  <span className="faint">{status?.driverOk ? 'Controladores listos y activos' : status?.driverError ?? 'Comprobando…'}</span>
                </section>
                <section className="card stat stat-link" onClick={() => setView('mapping')} role="button" tabIndex={0} id="stat-profile">
                  <span className="stat-label row"><IconLayers style={{ width: 15, color: activeProfile.color }} /> Mapeo activo</span>
                  <span className="stat-value">{settings.bindings.length}<small>asignaciones</small></span>
                  <span className="faint row" style={{ gap: 6 }}><IconEdit style={{ width: 14 }} /> Ratón → {settings.mouseTarget === 'NONE' ? 'ninguno' : settings.mouseTarget === 'RS' ? 'stick derecho' : 'stick izquierdo'}</span>
                </section>
              </div>
            </div>
          )}

          {view === 'profiles' && (
            <ProfilesView
              profiles={store.profiles}
              activeId={store.activeId}
              editingId={editProfile.id}
              devices={devices}
              onActivate={activate}
              onEdit={editProfileIn}
              onUpsert={upsert}
              onAdd={addProfiles}
              onDelete={removeProfile}
              toast={toast}
            />
          )}
          {view === 'mapping' && <MappingView key={editProfile.id} settings={editSettings} onChange={setEditSettings} live={snapshot} />}
          {view === 'curve' && <CurveTuner key={editProfile.id} settings={editSettings} onChange={setEditSettings} live={snapshot} />}
          {view === 'devices' && <DevicesView key={editProfile.id} settings={editSettings} onChange={setEditSettings} toast={toast} />}
            </>
          )}
          {view === 'license' && <LicenseStatus hwid={hwid} license={license} isDebug={status?.isDebug ?? !isTauri} onGoAccount={() => setView('account')} accountEmail={auth.user?.email} />}
          {view === 'account' && <AccountView auth={auth} license={license} hwid={hwid} onGoLicense={() => setView('license')} />}
          {view === 'superadmin' && auth.user?.isSuper && <SuperAdminView toast={toast} />}
        </div>
      </main>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`alert toast ${t.kind}`}>
            <IconAlert />{t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
