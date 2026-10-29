import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { AuthState } from '../hooks/useAuth';
import type { LicenseState } from '../hooks/useLicense';
import { googleEnabled, type AuthIdentity } from '../services/authService';
import DownloadCard from './DownloadCard';
import { formatRemaining } from './LicenseStatus';
import {
  IconAlert, IconArrowRight, IconBolt, IconCake, IconCheck, IconEdit, IconEye, IconEyeOff, IconGift, IconGoogle, IconInfo, IconLink, IconLock, IconLogout,
  IconMail, IconPhone, IconRefresh, IconShield, IconSpark, IconUnlink, IconUser, IconX,
} from './Icons';

interface Props {
  auth: AuthState;
  license: LicenseState;
  hwid: string;
  onGoLicense: () => void;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                           */
/* ------------------------------------------------------------------ */
function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = pw ? Math.max(1, Math.min(4, s)) : 0;
  return { score, label: ['', 'Débil', 'Aceptable', 'Buena', 'Excelente'][score] };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function parsePhone(raw: string, defaultPrefix: '+57' | '+1' = '+57'): { prefix: '+57' | '+1'; digits: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+57') || (trimmed.startsWith('57') && trimmed.replace(/\D/g, '').length > 10)) {
    return { prefix: '+57', digits: trimmed.replace(/^\+?57/, '').replace(/\D/g, '').slice(0, 10) };
  }
  if (trimmed.startsWith('+1') || (trimmed.startsWith('1') && trimmed.replace(/\D/g, '').length > 10)) {
    return { prefix: '+1', digits: trimmed.replace(/^\+?1/, '').replace(/\D/g, '').slice(0, 10) };
  }
  return { prefix: defaultPrefix, digits: trimmed.replace(/\D/g, '').slice(0, 10) };
}


function Avatar({ name, url, size = 72 }: { name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return (
    <div className="acc-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url && !broken ? <img src={url} alt={`Avatar de ${name}`} referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{initials}</span>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <IconLock className="input-icon" />
      <input
        id={id} className="input with-icon" type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus}
        required minLength={8} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? '••••••••'}
      />
      <button type="button" className="input-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} tabIndex={-1}>
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

function StrengthMeter({ pw }: { pw: string }) {
  const { score, label } = strength(pw);
  if (!pw) return null;
  return (
    <div className={`pw-meter s${score}`} aria-live="polite">
      <div className="pw-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= score ? 'on' : ''} />)}</div>
      <span>{label}</span>
    </div>
  );
}

function Messages({ auth }: { auth: AuthState }) {
  if (!auth.error && !auth.info) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {auth.error && <div className="alert error"><IconAlert /><span>{auth.error}</span></div>}
      {auth.info && <div className="alert success"><IconCheck /><span>{auth.info}</span></div>}
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="alert info acc-demo">
      <IconSpark />
      <span>
        <strong>Modo demostración.</strong> El archivo <code>.env</code> no tiene las claves de Supabase, así que las cuentas se simulan
        en este equipo. Rellena <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env</code> y reinicia la app
        para usar cuentas reales.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pantalla de acceso (sin sesión)                                      */
/* ------------------------------------------------------------------ */
interface AuthPanelProps {
  auth: AuthState;
  initialMode?: 'login' | 'register';
  bannerNotice?: string;
  onGoLanding?: () => void;
}

function AuthPanel({ auth, initialMode, bannerNotice, onGoLanding }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'recovery'>(() => {
    if (auth.isRecovery) return 'recovery';
    return initialMode ?? 'login';
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phonePrefix, setPhonePrefix] = useState<'+57' | '+1'>('+57');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [showPhoneInfo, setShowPhoneInfo] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const cleanPhoneDigits = phoneDigits.replace(/\D/g, '');
  const phoneHasValue = cleanPhoneDigits.length > 0;
  const phoneIsValid = !phoneHasValue || cleanPhoneDigits.length === 10;
  const phoneError = phoneHasValue && cleanPhoneDigits.length !== 10
    ? `El número debe tener 10 dígitos (${phonePrefix === '+57' ? 'ej. 300 123 4567' : 'ej. 202 555 0123'}). Ingresaste ${cleanPhoneDigits.length}.`
    : null;

  const handlePhoneChange = (val: string) => {
    const parsed = parsePhone(val, phonePrefix);
    setPhonePrefix(parsed.prefix);
    setPhoneDigits(parsed.digits);
  };

  useEffect(() => {
    if (auth.isRecovery) setMode('recovery');
  }, [auth.isRecovery]);

  useEffect(() => {
    if (initialMode && !auth.isRecovery) {
      setMode(initialMode);
    }
  }, [initialMode, auth.isRecovery]);

  const switchMode = (m: typeof mode) => {
    if (m !== 'recovery') auth.setIsRecovery(false);
    setMode(m);
    auth.clearMessages();
  };

  const mismatch = (mode === 'register' || mode === 'recovery') && confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') {
      await auth.resetPassword(email);
      return;
    }
    if (mode === 'recovery') {
      if (password !== confirm) return;
      const ok = await auth.setPassword(password);
      if (ok) {
        setPassword('');
        setConfirm('');
        auth.setIsRecovery(false);
        setMode('login');
      }
      return;
    }
    if (mode === 'register') {
      if (password !== confirm) return;
      if (!phoneIsValid) return;
      const formattedPhone = phoneHasValue ? `${phonePrefix} ${cleanPhoneDigits}` : undefined;
      if (await auth.signUp(email, password, name, formattedPhone)) {
        setPassword('');
        setConfirm('');
        setPhoneDigits('');
        setMode('login');
      }
      return;
    }
    await auth.signIn(email, password);
  };

  const busy = auth.pending !== null;
  const titles = {
    login: ['Bienvenido a AimCake', 'Inicia sesión para activar tu Aim Assist y perfiles'],
    register: ['Crea tu cuenta AimCake', 'Prueba gratis de 3 días de Aim Assist para mouse y teclado'],
    reset: ['Recuperar contraseña', 'Te enviaremos las instrucciones a tu correo'],
    recovery: ['Restablecer contraseña', 'Introduce tu nueva contraseña para continuar'],
  }[mode];

  return (
    <div className="acc-auth">
      <aside className="acc-auth-hero">
        <div className="acc-auth-orb" />
        <div className="row-between" style={{ width: '100%', marginBottom: 12 }}>
          <span className="acc-eyebrow"><IconCake /> AimCake</span>
          {onGoLanding && (
            <button id="auth-go-landing" type="button" className="btn btn-sm btn-ghost" onClick={onGoLanding} style={{ fontSize: 12 }}>
              ← Web Oficial
            </button>
          )}
        </div>
        <h2>Aim Assist real para<br /><span className="grad-text">mouse y teclado.</span></h2>
        <p>AimCake permite a los jugadores de mouse y teclado disfrutar de la ayuda de tiro (Aim Assist) en sus juegos favoritos, manteniendo toda la velocidad y puntería de su mouse.</p>
        <ul className="acc-benefits">
          <li><span><IconBolt /></span><div><strong>Aim Assist en Mouse y Teclado</strong><small>Asistencia de apuntado nativa jugando con tu setup habitual</small></div></li>
          <li><span><IconGift /></span><div><strong>3 Días de Prueba Gratis</strong><small>Prueba todas las funciones de inmediato sin tarjeta ni pagos</small></div></li>
          <li><span><IconSpark /></span><div><strong>Perfiles y Ajustes Listos</strong><small>Configuraciones preparadas para empezar a jugar al instante</small></div></li>
        </ul>
        <div style={{ marginTop: 20 }}>
          <DownloadCard compact onRequireLogin={() => switchMode('register')} />
        </div>
      </aside>

      <section className="card acc-auth-card">
        {bannerNotice && (
          <div className="alert info" style={{ marginBottom: 16 }}>
            <IconSpark />
            <span>{bannerNotice}</span>
          </div>
        )}
        {auth.mode === 'demo' && <DemoBanner />}
        <header className="acc-auth-head">
          <h2>{titles[0]}</h2>
          <p className="faint">{titles[1]}</p>
        </header>

        {mode !== 'reset' && mode !== 'recovery' && (
          <div className="acc-tabs" role="tablist">
            <button id="auth-tab-login" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>Iniciar sesión</button>
            <button id="auth-tab-register" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchMode('register')}>Crear cuenta</button>
            <span className="acc-tabs-ink" style={{ transform: `translateX(${mode === 'login' ? 0 : 100}%)` }} />
          </div>
        )}

        {mode !== 'reset' && mode !== 'recovery' && googleEnabled && (
          <>
            <button id="auth-google" className="btn btn-google btn-block" onClick={auth.google} disabled={busy}>
              {auth.pending === 'google' ? <span className="spinner" /> : <IconGoogle />}
              {mode === 'login' ? 'Continuar con Google' : 'Registrarse con Google'}
            </button>
            <div className="acc-or"><span>o con tu correo</span></div>
          </>
        )}

        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="auth-name">Nombre</label>
                <div className="input-wrap">
                  <IconUser className="input-icon" />
                  <input id="auth-name" className="input with-icon" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo quieres que te llamemos" />
                </div>
              </div>
              <div className="field">
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <label htmlFor="auth-phone" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <span>Número de teléfono móvil</span>
                    <span className="acc-tag-optional">(Opcional)</span>
                    <button
                      type="button"
                      className="acc-info-icon-btn"
                      onClick={() => setShowPhoneInfo((s) => !s)}
                      title="Ver información sobre el teléfono opcional"
                      aria-label="Información sobre teléfono opcional"
                    >
                      <IconInfo />
                    </button>
                  </label>
                  <span className="chip ok xs"><IconGift /> +3 días gratis</span>
                </div>

                {showPhoneInfo && (
                  <div className="alert info" style={{ padding: '8px 12px', fontSize: 12, margin: '4px 0' }}>
                    <IconInfo />
                    <span>
                      <strong>Teléfono 100% opcional:</strong> No es obligatorio para registrarte ni para usar AimCake. Si decides incluirlo para recibir +3 días adicionales de prueba, actualmente solo se aceptan números móviles de <strong>Estados Unidos (+1)</strong> o <strong>Colombia (+57)</strong> de 10 dígitos.
                    </span>
                  </div>
                )}

                <div className="acc-phone-row">
                  <select
                    className="input acc-phone-select"
                    value={phonePrefix}
                    onChange={(e) => setPhonePrefix(e.target.value as '+57' | '+1')}
                    aria-label="Código de país"
                  >
                    <option value="+57">🇨🇴 +57 (CO)</option>
                    <option value="+1">🇺🇸 +1 (US)</option>
                  </select>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <IconPhone className="input-icon" />
                    <input
                      id="auth-phone"
                      className="input with-icon"
                      type="tel"
                      autoComplete="tel-national"
                      value={phoneDigits}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder={phonePrefix === '+57' ? '300 123 4567' : '202 555 0123'}
                      maxLength={14}
                    />
                  </div>
                </div>

                {phoneError && (
                  <span className="field-error" style={{ fontSize: 11.5 }}>{phoneError}</span>
                )}

                <small className="faint" style={{ fontSize: 11.5, display: 'block', marginTop: 2 }}>
                  Podrás verificarlo más tarde por SMS para desbloquear 3 días adicionales de prueba gratuita.
                </small>
              </div>
            </>
          )}
          {mode !== 'recovery' && (
            <div className="field">
              <label htmlFor="auth-email">Correo electrónico</label>
              <div className="input-wrap">
                <IconMail className="input-icon" />
                <input id="auth-email" className="input with-icon" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
              </div>
            </div>
          )}
          {mode !== 'reset' && (
            <div className="field">
              <div className="row-between">
                <label htmlFor="auth-password">{mode === 'recovery' ? 'Nueva contraseña' : 'Contraseña'}</label>
                {mode === 'login' && <button type="button" id="auth-forgot" className="link-btn" onClick={() => switchMode('reset')}>¿La olvidaste?</button>}
              </div>
              <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' || mode === 'recovery' ? 'Mínimo 8 caracteres' : undefined} />
              {(mode === 'register' || mode === 'recovery') && <StrengthMeter pw={password} />}
            </div>
          )}
          {(mode === 'register' || mode === 'recovery') && (
            <div className="field">
              <label htmlFor="auth-confirm">Repite la nueva contraseña</label>
              <PasswordInput id="auth-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              {mismatch && <span className="field-error">Las contraseñas no coinciden</span>}
            </div>
          )}

          <Messages auth={auth} />

          <button id="auth-submit" type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy || mismatch || (mode === 'register' && !phoneIsValid)}>
            {auth.pending && auth.pending !== 'google' ? <span className="spinner" /> : <IconArrowRight />}
            {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : mode === 'recovery' ? 'Guardar contraseña' : 'Enviar enlace'}
          </button>
          {(mode === 'reset' || mode === 'recovery') && (
            <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => switchMode('login')}>← Volver a iniciar sesión</button>
          )}
        </form>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de cuenta (con sesión)                                         */
/* ------------------------------------------------------------------ */
function AccountPanel({ auth, license, hwid, onGoLicense }: Props) {
  const user = auth.user!;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [phoneDraftPrefix, setPhoneDraftPrefix] = useState<'+57' | '+1'>('+57');
  const [phoneDraftDigits, setPhoneDraftDigits] = useState('');
  const [showAccountPhoneInfo, setShowAccountPhoneInfo] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const pwCardRef = useRef<HTMLElement>(null);
  const [flashPw, setFlashPw] = useState(false);

  useEffect(() => { setNameDraft(user.name); }, [user.name]);
  useEffect(() => {
    if (user.phone) {
      const parsed = parsePhone(user.phone, '+57');
      setPhoneDraftPrefix(parsed.prefix);
      setPhoneDraftDigits(parsed.digits);
    } else {
      setPhoneDraftDigits('');
    }
  }, [user.phone]);

  const cleanDraftDigits = phoneDraftDigits.replace(/\D/g, '');
  const isDraftValid = cleanDraftDigits.length === 10;
  const currentFormattedUserPhone = user.phone ? user.phone.replace(/\s+/g, '') : '';
  const currentDraftFormatted = `${phoneDraftPrefix}${cleanDraftDigits}`;
  const isDraftChanged = currentDraftFormatted !== currentFormattedUserPhone;

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDraftValid) return;
    const fullPhone = `${phoneDraftPrefix} ${cleanDraftDigits}`;
    if (await auth.updatePhone(fullPhone)) setShowPhoneVerify(true);
  };

  const submitVerifyCode = async () => {
    if (smsCode.length < 6) return;
    const ok = await auth.verifyPhone(smsCode);
    if (ok) {
      setShowPhoneVerify(false);
      setSmsCode('');
    }
  };

  const google = user.identities.find((i) => i.provider === 'google') ?? null;
  const others = user.identities.filter((i) => i.provider !== 'email' && i.provider !== 'google');
  const methods = (user.hasPassword ? 1 : 0) + user.identities.filter((i) => i.provider !== 'email').length;
  const unified = user.hasPassword && !!google;

  const now = Date.now() / 1000;
  const lp = license.payload;
  const lActive = !!lp && lp.expires_at > now;
  const lPro = lActive && lp!.status === 'active';

  const focusPassword = () => {
    pwCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashPw(true);
    setTimeout(() => setFlashPw(false), 1400);
    setTimeout(() => document.getElementById('acc-new-password')?.focus(), 350);
  };

  const pwMismatch = pw2.length > 0 && pw !== pw2;
  const submitPw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return;
    if (await auth.setPassword(pw)) { setPw(''); setPw2(''); }
  };
  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (await auth.changeEmail(newEmail)) setNewEmail('');
  };
  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === user.name) { setEditingName(false); return; }
    if (await auth.updateName(nameDraft)) setEditingName(false);
  };

  const unlinkBtn = (i: AuthIdentity) => {
    const disabled = methods < 2;
    if (confirmUnlink === i.id) {
      return (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm btn-danger" onClick={() => { auth.unlink(i); setConfirmUnlink(null); }} disabled={auth.pending !== null}>
            {auth.pending === `unlink-${i.id}` ? <span className="spinner" /> : <IconUnlink />} Confirmar
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmUnlink(null)} aria-label="Cancelar"><IconX /></button>
        </div>
      );
    }
    return (
      <button
        id={`unlink-${i.provider}`} className="btn btn-sm" disabled={disabled}
        title={disabled ? 'Es tu único método de acceso: añade una contraseña antes de desvincularlo' : 'Desvincular'}
        onClick={() => setConfirmUnlink(i.id)}
      >
        <IconUnlink /> Desvincular
      </button>
    );
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      {auth.mode === 'demo' && <DemoBanner />}
      <Messages auth={auth} />

      {/* ------------------------------ Perfil ------------------------------ */}
      <section className="card acc-hero">
        <div className="acc-hero-bg" />
        <div className="acc-hero-main">
          <div className="acc-avatar-ring"><Avatar name={user.name} url={user.avatarUrl} size={84} /></div>
          <div className="acc-hero-id">
            {editingName ? (
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="acc-name-input" className="input" autoFocus maxLength={60} value={nameDraft} style={{ maxWidth: 280 }}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameDraft(user.name); } }}
                />
                <button className="btn btn-sm btn-primary" onClick={saveName} disabled={auth.pending === 'name'}>{auth.pending === 'name' ? <span className="spinner" /> : <IconCheck />} Guardar</button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setEditingName(false); setNameDraft(user.name); }} aria-label="Cancelar"><IconX /></button>
              </div>
            ) : (
              <h2 className="acc-name">
                {user.name}
                <button id="acc-edit-name" className="icon-btn" onClick={() => setEditingName(true)} aria-label="Editar nombre" title="Editar nombre"><IconEdit /></button>
              </h2>
            )}
            <div className="acc-email-line">
              <IconMail /> <span>{user.email ?? 'Sin correo'}</span>
              {user.emailConfirmed ? <span className="chip ok sm"><IconCheck /> Verificado</span> : <span className="chip warn sm">Sin verificar</span>}
            </div>
            <div className="acc-providers">
              {user.hasPassword && <span className="prov-pill"><IconLock /> Contraseña</span>}
              {google && <span className="prov-pill google"><IconGoogle /> Google</span>}
              {others.map((o) => <span key={o.id} className="prov-pill">{o.provider}</span>)}
            </div>
          </div>
          <button id="acc-license-card" className={`acc-license ${lPro ? 'pro' : lActive ? 'trial' : 'none'}`} onClick={onGoLicense}>
            <span className="acc-license-label">Licencia vinculada</span>
            <strong>{lPro ? 'Pro activa' : lActive ? `Prueba · ${formatRemaining(lp!.expires_at - now)}` : 'Sin licencia'}</strong>
            <small>{hwid ? 'Equipo vinculado' : 'Conectando equipo…'}</small>
            <span className="acc-license-go">Gestionar <IconArrowRight /></span>
          </button>
        </div>
        <dl className="acc-meta">
          <div><dt>Miembro desde</dt><dd>{fmtDate(user.createdAt)}</dd></div>
          <div><dt>Último acceso</dt><dd>{fmtDateTime(user.lastSignInAt)}</dd></div>
          <div><dt>Métodos de acceso</dt><dd>{methods}</dd></div>
          <div><dt>ID de usuario</dt><dd className="mono" title={user.id}>{user.id.slice(0, 8)}…</dd></div>
        </dl>
      </section>

      {/* ------------------------------ Descarga del software ------------------------------ */}
      <DownloadCard userEmail={user.email} />

      <div className="grid grid-2 account-grid">
        {/* ------------------------ Métodos de acceso ------------------------ */}
        <section className="card">
          <div className="card-title"><span>Métodos de inicio de sesión</span><span className={`chip ${unified ? 'ok' : ''}`}>{unified ? 'Cuenta unificada' : `${methods} de 2`}</span></div>

          <div className={`link-viz ${unified ? 'linked' : ''}`} aria-hidden>
            <div className={`link-node ${user.hasPassword ? 'on' : ''}`}><IconMail /><small>Correo</small></div>
            <div className="link-line"><i /><span className="link-badge">{unified ? <IconLink /> : <IconUnlink />}</span></div>
            <div className={`link-node ${google ? 'on' : ''}`}><IconGoogle /><small>Google</small></div>
          </div>
          <p className="faint" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, textAlign: 'center' }}>
            {unified
              ? 'Puedes entrar con Google o con tu correo y contraseña: ambos abren esta misma cuenta y su licencia.'
              : !google ? 'Conecta tu Google para entrar con un clic. Seguirá siendo la misma cuenta y la misma licencia.'
                : 'Crea una contraseña para poder entrar también con tu correo sin depender de Google.'}
          </p>

          <div className="method-list">
            <div className={`method ${user.hasPassword ? 'on' : ''}`}>
              <div className="method-icon mail"><IconMail /></div>
              <div className="method-info">
                <strong>Correo y contraseña</strong>
                <span>{user.hasPassword ? user.email : 'Añade una contraseña para entrar con tu correo'}</span>
              </div>
              {user.hasPassword
                ? <button id="method-password-change" className="btn btn-sm" onClick={focusPassword}><IconLock /> Cambiar</button>
                : <button id="method-password-create" className="btn btn-sm btn-primary" onClick={focusPassword}><IconLock /> Crear contraseña</button>}
            </div>

            <div className={`method ${google ? 'on' : ''}`}>
              <div className="method-icon google"><IconGoogle /></div>
              <div className="method-info">
                <strong>Google</strong>
                <span>{google ? `Conectado como ${google.email ?? user.email}` : 'No conectado'}</span>
              </div>
              {google ? unlinkBtn(google) : (
                <button id="method-google-link" className="btn btn-sm btn-google" onClick={auth.linkGoogle} disabled={auth.pending !== null || !googleEnabled}>
                  {auth.pending === 'link-google' ? <span className="spinner" /> : <IconGoogle />} Conectar Google
                </button>
              )}
            </div>

            {others.map((o) => (
              <div className="method on" key={o.id}>
                <div className="method-icon"><IconLink /></div>
                <div className="method-info"><strong style={{ textTransform: 'capitalize' }}>{o.provider}</strong><span>{o.email ?? 'Conectado'}</span></div>
                {unlinkBtn(o)}
              </div>
            ))}
          </div>
          {auth.mode === 'supabase' && !google && (
            <p className="faint acc-footnote"><IconAlert /> Requiere activar <em>Allow manual linking</em> y el proveedor Google en Supabase → Authentication.</p>
          )}
        </section>

        <div className="stack" style={{ gap: 18 }}>
          {/* ---------------------------- Contraseña ---------------------------- */}
          <section ref={pwCardRef} className={`card ${flashPw ? 'flash' : ''}`}>
            <div className="card-title"><span className="row"><IconLock style={{ width: 16, color: 'var(--accent)' }} /> {user.hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}</span></div>
            {!user.hasPassword && (
              <p className="faint" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
                Tu cuenta usa solo Google. Al crear una contraseña podrás entrar también con <strong className="muted">{user.email}</strong> y
                quedará vinculada a esta misma cuenta.
              </p>
            )}
            <form className="stack" style={{ gap: 12 }} onSubmit={submitPw}>
              <div className="field">
                <label htmlFor="acc-new-password">Nueva contraseña</label>
                <PasswordInput id="acc-new-password" value={pw} onChange={setPw} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
                <StrengthMeter pw={pw} />
              </div>
              <div className="field">
                <label htmlFor="acc-new-password2">Repite la contraseña</label>
                <PasswordInput id="acc-new-password2" value={pw2} onChange={setPw2} autoComplete="new-password" />
                {pwMismatch && <span className="field-error">Las contraseñas no coinciden</span>}
              </div>
              <button id="acc-save-password" type="submit" className="btn btn-primary" disabled={!pw || pwMismatch || pw.length < 8 || auth.pending !== null}>
                {auth.pending === 'password' ? <span className="spinner" /> : <IconCheck />} {user.hasPassword ? 'Actualizar contraseña' : 'Crear y vincular'}
              </button>
            </form>
          </section>

          {/* ------------------------------ Correo ------------------------------ */}
          <section className="card">
            <div className="card-title"><span className="row"><IconMail style={{ width: 16, color: 'var(--accent-2)' }} /> Correo electrónico</span></div>
            {user.pendingEmail && (
              <div className="alert info" style={{ marginBottom: 12 }}><IconMail /><span>Cambio pendiente a <strong>{user.pendingEmail}</strong>. Confírmalo desde el enlace enviado.</span></div>
            )}
            <form className="row" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={submitEmail}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="acc-new-email">Nuevo correo</label>
                <div className="input-wrap">
                  <IconMail className="input-icon" />
                  <input id="acc-new-email" className="input with-icon" type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={user.email ?? 'tu@correo.com'} />
                </div>
              </div>
              <button id="acc-save-email" type="submit" className="btn" disabled={!newEmail || newEmail === user.email || auth.pending !== null}>
                {auth.pending === 'email' ? <span className="spinner" /> : <IconArrowRight />} Cambiar
              </button>
            </form>
          </section>

          {/* ------------------- Teléfono y Bonificación (+3 días) ------------------- */}
          <section className="card">
            <div className="card-title">
              <span className="row"><IconPhone style={{ width: 16, color: 'var(--accent)' }} /> Teléfono y Bonificación</span>
              <span className={`chip ${user.phoneConfirmed ? 'ok' : 'warn'}`}>
                <IconGift /> {user.phoneConfirmed ? '+3 Días aplicados' : '+3 Días gratis'}
              </span>
            </div>

            <p className="faint" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
              Registra y verifica tu teléfono móvil para recibir <strong>+3 días adicionales de prueba gratuita</strong> en tu cuenta.
            </p>

            {user.phoneConfirmed ? (
              <div className="alert alert-ok">
                <IconCheck />
                <div style={{ flex: 1 }}>
                  <strong>Teléfono verificado:</strong> {user.phone}
                  <br />
                  <small className="faint">Tu bonificación de +3 días gratuitos ya ha sido activada en tu cuenta.</small>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                <form className="stack" style={{ gap: 10 }} onSubmit={submitPhone}>
                  <div className="field">
                    <div className="row-between" style={{ alignItems: 'center' }}>
                      <label htmlFor="acc-phone" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}>
                        <span>Número de teléfono móvil</span>
                        <span className="acc-tag-optional">(Opcional)</span>
                        <button
                          type="button"
                          className="acc-info-icon-btn"
                          onClick={() => setShowAccountPhoneInfo((s) => !s)}
                          title="Ver información"
                          aria-label="Información sobre teléfono opcional"
                        >
                          <IconInfo />
                        </button>
                      </label>
                      <span className="chip ok xs"><IconGift /> +3 días gratis</span>
                    </div>

                    {showAccountPhoneInfo && (
                      <div className="alert info" style={{ padding: '8px 12px', fontSize: 12, margin: '4px 0' }}>
                        <IconInfo />
                        <span>
                          Solo se admiten líneas móviles de <strong>Colombia (+57)</strong> o <strong>Estados Unidos (+1)</strong> de 10 dígitos.
                        </span>
                      </div>
                    )}

                    <div className="acc-phone-row" style={{ marginTop: 6 }}>
                      <select
                        className="input acc-phone-select"
                        value={phoneDraftPrefix}
                        onChange={(e) => setPhoneDraftPrefix(e.target.value as '+57' | '+1')}
                        aria-label="Código de país"
                      >
                        <option value="+57">🇨🇴 +57 (CO)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                      </select>
                      <div className="input-wrap" style={{ flex: 1 }}>
                        <IconPhone className="input-icon" />
                        <input
                          id="acc-phone"
                          className="input with-icon"
                          type="tel"
                          value={phoneDraftDigits}
                          onChange={(e) => {
                            const parsed = parsePhone(e.target.value, phoneDraftPrefix);
                            setPhoneDraftPrefix(parsed.prefix);
                            setPhoneDraftDigits(parsed.digits);
                          }}
                          placeholder={phoneDraftPrefix === '+57' ? '300 123 4567' : '202 555 0123'}
                          maxLength={14}
                        />
                      </div>
                      <button
                        id="acc-save-phone"
                        type="submit"
                        className="btn"
                        disabled={!isDraftValid || !isDraftChanged || auth.pending !== null}
                      >
                        {auth.pending === 'phone' ? <span className="spinner" /> : <IconArrowRight />} Guardar
                      </button>
                    </div>

                    {cleanDraftDigits.length > 0 && cleanDraftDigits.length !== 10 && (
                      <span className="field-error" style={{ fontSize: 11.5 }}>
                        El número debe tener 10 dígitos (tienes {cleanDraftDigits.length}).
                      </span>
                    )}
                  </div>
                </form>

                {user.phone && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <strong>Verificación pendiente</strong>
                        <div className="faint" style={{ fontSize: 12 }}>Verifica {user.phone} para recibir +3 días de prueba</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setShowPhoneVerify((s) => !s)}
                      >
                        <IconGift /> {showPhoneVerify ? 'Ocultar código' : 'Verificar (+3 días gratis)'}
                      </button>
                    </div>

                    {showPhoneVerify && (
                      <div className="stack" style={{ gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                        <label htmlFor="acc-sms-code" style={{ fontSize: 13, fontWeight: 600 }}>Introduce el código SMS de 6 dígitos:</label>
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <input
                            id="acc-sms-code"
                            className="input"
                            maxLength={6}
                            style={{ letterSpacing: '4px', textAlign: 'center', fontSize: 18, fontWeight: 700, width: 140 }}
                            value={smsCode}
                            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            autoFocus
                          />
                          <button
                            id="acc-confirm-sms-btn"
                            className="btn btn-primary"
                            onClick={submitVerifyCode}
                            disabled={smsCode.length < 6 || auth.pending !== null}
                          >
                            {auth.pending === 'verify-phone' ? <span className="spinner" /> : <IconCheck />} Reclamar +3 días
                          </button>
                        </div>
                        <small className="faint">Código de demostración: puedes ingresar cualquier código de 6 dígitos (ej. 123456).</small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ------------------------------ Sesión ------------------------------ */}
      <section className="card">
        <div className="card-title"><span>Sesión y seguridad</span></div>
        <div className="acc-session">
          <div className="acc-session-item">
            <div className="method-icon"><IconLogout /></div>
            <div className="method-info"><strong>Cerrar sesión en este equipo</strong><span>La licencia en caché se elimina; vuelve a entrar para revalidar.</span></div>
            <button id="acc-signout" className="btn" onClick={() => auth.signOut(false)} disabled={auth.pending !== null}>
              {auth.pending === 'signout' && !confirmGlobal ? <span className="spinner" /> : <IconLogout />} Cerrar sesión
            </button>
          </div>
          <div className="acc-session-item">
            <div className="method-icon danger"><IconShield /></div>
            <div className="method-info"><strong>Cerrar sesión en todos los dispositivos</strong><span>Revoca todas las sesiones abiertas de tu cuenta.</span></div>
            {confirmGlobal ? (
              <div className="row" style={{ gap: 6 }}>
                <button id="acc-signout-all-confirm" className="btn btn-danger" onClick={() => auth.signOut(true)} disabled={auth.pending !== null}>
                  {auth.pending === 'signout' ? <span className="spinner" /> : null} Sí, cerrar todas
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmGlobal(false)}>Cancelar</button>
              </div>
            ) : (
              <button id="acc-signout-all" className="btn btn-danger" onClick={() => setConfirmGlobal(true)}>Cerrar todas</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barrera de Verificación de Correo                                    */
/* ------------------------------------------------------------------ */
export function EmailVerificationBarrier({ auth, onGoLanding }: { auth: AuthState; onGoLanding?: () => void }) {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    const ok = await auth.resendConfirmation(auth.user?.email ?? '');
    if (ok) setCooldown(60);
  };

  return (
    <div className="email-verify-barrier">
      <div className="card email-verify-card">
        <div className="email-verify-icon">
          <IconMail style={{ width: 42, height: 42, color: 'var(--accent)' }} />
        </div>
        <h2>Verifica tu correo electrónico</h2>
        <p className="email-verify-lead">
          Hemos enviado un enlace de confirmación oficial a:
          <br />
          <strong style={{ color: 'var(--accent)', fontSize: 16 }}>{auth.user?.email}</strong>
        </p>
        <p className="faint" style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 440, margin: '0 auto 16px' }}>
          Para activar tu Aim Assist en mouse y teclado y acceder a tus perfiles, haz clic en el enlace que enviamos a tu bandeja de entrada o spam.
        </p>

        <Messages auth={auth} />

        <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button
            id="verify-check-status-btn"
            className="btn btn-primary btn-lg"
            onClick={auth.reload}
            disabled={auth.pending !== null}
          >
            {auth.pending ? <span className="spinner" /> : <IconCheck />}
            Ya lo he confirmado / Comprobar estado
          </button>
          <button
            id="verify-resend-btn"
            className="btn btn-ghost"
            onClick={handleResend}
            disabled={cooldown > 0 || auth.pending !== null}
          >
            <IconRefresh />
            {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar correo'}
          </button>
          <button
            id="verify-logout-btn"
            className="btn btn-ghost"
            onClick={() => auth.signOut()}
          >
            <IconLogout /> Cerrar sesión
          </button>
          {onGoLanding && (
            <button
              id="verify-landing-btn"
              className="btn btn-ghost"
              onClick={onGoLanding}
            >
              Volver a la Web
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { AuthPanel };

export default function AccountView(props: Props) {
  const { auth } = props;
  const content = useMemo(() => (auth.loading ? 'loading' : auth.user ? 'account' : 'auth'), [auth.loading, auth.user]);
  if (content === 'loading') return <div className="boot" style={{ height: 320 }}><span className="spinner" style={{ width: 30, height: 30, borderWidth: 3, color: 'var(--accent)' }} /></div>;
  return content === 'account' ? <AccountPanel {...props} /> : <AuthPanel auth={auth} />;
}
