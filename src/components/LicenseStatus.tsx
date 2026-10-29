import { useEffect, useState } from 'react';
import type { LicenseState } from '../hooks/useLicense';
import { IconAlert, IconCheck, IconCopy, IconLogout, IconRefresh, IconShield, IconUser } from './Icons';

interface Props {
  hwid: string;
  license: LicenseState;
  isDebug: boolean;
  onGoAccount: () => void;
  /** Correo de la cuenta activa (useAuth); cubre el modo demo sin sesión de Supabase. */
  accountEmail?: string | null;
}

const TRIAL_SECONDS = 3 * 86400;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatRemaining(seconds: number) {
  if (seconds <= 0) return 'Expirada';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function Ring({ fraction, label, sub }: { fraction: number; label: string; sub: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 132 132">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="hsl(142 88% 52%)" />
            <stop offset="1" stopColor="hsl(186 95% 55%)" />
          </linearGradient>
        </defs>
        <circle cx="66" cy="66" r={r} fill="none" stroke="hsl(220 20% 30% / .35)" strokeWidth="9" />
        <circle
          cx="66" cy="66" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)', filter: 'drop-shadow(0 0 8px hsl(142 88% 52% / .5))' }}
        />
      </svg>
      <div className="ring-center"><div><strong>{label}</strong><span>{sub}</span></div></div>
    </div>
  );
}

export default function LicenseStatus({ hwid, license, isDebug, onGoAccount, accountEmail }: Props) {
  const now = useNow();
  const [copied, setCopied] = useState(false);
  // Sesión de demostración: hay usuario local pero no backend de Supabase.
  const demoSession = !license.session && !license.backendConfigured && !!accountEmail;

  const p = license.payload;
  const remaining = p ? p.expires_at - now : 0;
  const isActive = p?.status === 'active' && remaining > 0;
  const isTrial = p?.status === 'trial' && remaining > 0;

  const copy = async () => {
    await navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid grid-2">
      <div className="stack">
        <section className="card">
          <div className="card-title">
            <span>Estado de licencia</span>
            {isActive ? <span className="chip ok"><span className="dot" />Suscripción activa</span>
              : isTrial ? <span className="chip warn"><span className="dot" />Prueba gratuita</span>
              : <span className="chip bad"><span className="dot" />Sin licencia</span>}
          </div>
          <div className="license-hero">
            <Ring
              fraction={isActive ? 1 : isTrial ? remaining / TRIAL_SECONDS : 0}
              label={isActive ? 'PRO' : isTrial ? formatRemaining(remaining).split(' ')[0] : '—'}
              sub={isActive ? 'activa' : isTrial ? 'restantes' : 'inactiva'}
            />
            <div className="stack" style={{ gap: 8 }}>
              <h3 style={{ fontSize: 20 }}>
                {isActive ? 'Acceso completo' : isTrial ? `Prueba: ${formatRemaining(remaining)}` : 'Activa tu prueba de 3 días'}
              </h3>
              <p className="faint" style={{ margin: 0, lineHeight: 1.55 }}>
                {isActive
                  ? `Licencia activa válida hasta ${new Date(p!.expires_at * 1000).toLocaleString()}. Se renueva automáticamente al abrir la app.`
                  : isTrial
                    ? `Tu prueba termina el ${new Date(p!.expires_at * 1000).toLocaleString()}. Suscríbete para seguir usando AimCake.`
                    : 'Cada equipo obtiene una prueba gratuita de 3 días para disfrutar de Aim Assist en mouse y teclado.'}
              </p>
              {license.session ? (
                <span className="faint">Sesión: <strong className="muted">{license.session.user.email}</strong></span>
              ) : demoSession ? (
                <span className="faint">Sesión (demo): <strong className="muted">{accountEmail}</strong></span>
              ) : null}
            </div>
          </div>
          <hr className="divider" />
          <div className="field">
            <label>Identificador de tu equipo</label>
            <div className="hwid-box">
              <IconShield style={{ width: 18, color: 'var(--accent)' }} />
              <code title={hwid}>{hwid || 'Calculando…'}</code>
              <button id="copy-hwid" className="btn btn-ghost btn-sm" onClick={copy} disabled={!hwid}>
                {copied ? <IconCheck /> : <IconCopy />}
              </button>
            </div>
          </div>
          {(license.error || license.info) && <div style={{ height: 14 }} />}
          {license.error && <div className="alert error"><IconAlert />{license.error}</div>}
          {license.info && <div className="alert info" style={{ marginTop: license.error ? 10 : 0 }}><IconCheck />{license.info}</div>}
          {license.session && (
            <div className="row" style={{ marginTop: 16 }}>
              <button id="refresh-license" className="btn" onClick={license.refresh} disabled={license.busy}>
                {license.busy ? <span className="spinner" /> : <IconRefresh />} Revalidar
              </button>
              <button id="logout" className="btn btn-ghost" onClick={license.logout}><IconLogout /> Cerrar sesión</button>
            </div>
          )}
        </section>

        {isDebug && (
          <section className="card">
            <div className="card-title">Modo desarrollador</div>
            <p className="faint" style={{ marginTop: 0, lineHeight: 1.55 }}>
              Genera un token local sin firma del servidor. Solo lo aceptan las compilaciones <code>debug</code> del backend
              (<code>pnpm tauri dev</code>); las versiones de producción lo rechazan.
            </p>
            <button id="dev-license" className="btn" onClick={license.activateDev} disabled={!hwid}>Activar licencia de desarrollo</button>
          </section>
        )}
      </div>

      <div className="stack">
        {demoSession ? (
          <section className="card acc-cta">
            <div className="acc-cta-icon"><IconShield /></div>
            <div className="stack" style={{ gap: 6 }}>
              <h3 style={{ fontSize: 18 }}>Sesión de demostración</h3>
              <p className="faint" style={{ margin: 0, lineHeight: 1.55 }}>
                Has entrado como <strong className="muted">{accountEmail}</strong>, pero sin servidor de licencias.
                Rellena <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env</code> para validar
                licencias reales y suscribirte.
              </p>
            </div>
            <button id="license-go-account" className="btn btn-block" onClick={onGoAccount}>
              <IconUser /> Ver cuenta
            </button>
          </section>
        ) : !license.session ? (
          <section className="card acc-cta">
            <div className="acc-cta-icon"><IconUser /></div>
            <div className="stack" style={{ gap: 6 }}>
              <h3 style={{ fontSize: 18 }}>Inicia sesión para activar tu licencia</h3>
              <p className="faint" style={{ margin: 0, lineHeight: 1.55 }}>
                La licencia se vincula a tu cuenta y a este equipo. Entra con Google o con correo y contraseña desde la sección Cuenta.
              </p>
            </div>
            <button id="license-go-account" className="btn btn-primary btn-block" onClick={onGoAccount}>
              <IconUser /> Ir a Cuenta
            </button>
          </section>
        ) : null}

        <section className="plan">
          <div className="card-title" style={{ color: 'var(--accent)' }}>Plan Pro</div>
          <div className="plan-price">$4.99<small> / mes</small></div>
          <ul>
            <li><IconCheck /> Emulación Xbox 360 a 1000 Hz</li>
            <li><IconCheck /> Curvas cinemáticas y perfiles ilimitados</li>
            <li><IconCheck /> Mapeo completo de teclado y ratón</li>
            <li><IconCheck /> 3 días de prueba gratuita por equipo</li>
            <li><IconCheck /> Cancela cuando quieras desde Stripe</li>
          </ul>
          <button id="subscribe" className="btn btn-primary btn-block" onClick={license.subscribe} disabled={!license.session || license.busy || isActive}>
            {isActive ? 'Ya eres Pro' : license.session ? 'Suscribirse con Stripe' : demoSession ? 'Requiere Supabase configurado' : 'Inicia sesión para suscribirte'}
          </button>
        </section>
      </div>
    </div>
  );
}
