/**
 * Cuenta de usuario: correo + contraseña, Google OAuth y vinculación de
 * identidades (Supabase Auth).
 *
 * - En escritorio (Tauri) el login con Google se abre en el navegador del
 *   sistema y vuelve por el deep link `xcb://auth/callback?code=...` (PKCE).
 * - Si `.env` no está configurado se usa un proveedor de DEMOSTRACIÓN local
 *   para poder previsualizar la interfaz; no crea cuentas reales.
 */
import type { User, UserIdentity } from '@supabase/supabase-js';
import { backendConfigured, signOut as licenseSignOut, supabase } from './licenseService';
import { bridge, isTauri } from './tauriBridge';

export type Provider = 'email' | 'google' | string;

export interface AuthIdentity {
  id: string;
  provider: Provider;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  raw?: UserIdentity;
}

export interface AuthUser {
  id: string;
  email: string | null;
  pendingEmail: string | null;
  name: string;
  avatarUrl: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  phoneConfirmed: boolean;
  bonusDaysGranted: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  identities: AuthIdentity[];
  /** Tiene contraseña (identidad `email` o contraseña añadida a una cuenta Google). */
  hasPassword: boolean;
}

export const googleEnabled = (import.meta.env.VITE_GOOGLE_AUTH_ENABLED ?? 'true') !== 'false';
export const SUPABASE_CALLBACK_URL = 'https://sknefafurgurmqgjzgfn.supabase.co/auth/v1/callback';

function redirectUrl() {
  if (isTauri) {
    const configured = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim();
    if (configured && (configured.startsWith('aimcake://') || configured.startsWith('xcb://'))) {
      return configured;
    }
    return 'aimcake://auth/callback';
  }
  return typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:1420/';
}

/* ------------------------------------------------------------------ */
/* Mensajes de error en español                                         */
/* ------------------------------------------------------------------ */
const ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión o usa Google.'],
  [/manual linking is disabled/i, 'La vinculación manual está desactivada. Actívala en Supabase → Authentication → Sign In / Providers → "Allow manual linking".'],
  [/identity is already linked|already linked to another user/i, 'Esa cuenta de Google ya está vinculada a otro usuario.'],
  [/single identity|at least 2 identities|only identity/i, 'No puedes quitar tu único método de inicio de sesión.'],
  [/should be at least|password.*(short|length)/i, 'La contraseña debe tener al menos 8 caracteres.'],
  [/should be different/i, 'La nueva contraseña debe ser distinta de la actual.'],
  [/weak.?password|pwned/i, 'La contraseña es demasiado débil o aparece en filtraciones conocidas.'],
  [/rate limit|too many requests|security purposes/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
  [/provider is not enabled|unsupported provider/i, 'El proveedor Google no está activado en Supabase → Authentication → Providers.'],
  [/reauthentication|requires recent login/i, 'Por seguridad, cierra sesión y vuelve a entrar antes de hacer este cambio.'],
  [/failed to fetch|network/i, 'No se pudo conectar con el servidor. Comprueba tu conexión.'],
  [/invalid.*email|unable to validate email/i, 'El correo electrónico no es válido.'],
];

export function authErrorText(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? '');
  for (const [re, text] of ERRORS) if (re.test(msg)) return text;
  return msg || 'Error desconocido.';
}

function fail(error: { message: string } | null | undefined) {
  if (error) throw new Error(authErrorText(error.message));
}

/* ------------------------------------------------------------------ */
/* Normalización del usuario                                            */
/* ------------------------------------------------------------------ */
function toAuthUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const identities: AuthIdentity[] = (u.identities ?? []).map((i) => ({
    id: i.identity_id ?? i.id,
    provider: i.provider,
    email: (i.identity_data?.email as string | undefined) ?? null,
    createdAt: i.created_at ?? null,
    lastSignInAt: i.last_sign_in_at ?? null,
    raw: i,
  }));
  const google = identities.find((i) => i.provider === 'google')?.raw?.identity_data ?? {};
  const name = (meta.display_name as string) || (meta.full_name as string) || (meta.name as string)
    || (google.full_name as string) || (u.email?.split('@')[0] ?? 'Usuario');
  return {
    id: u.id,
    email: u.email ?? null,
    pendingEmail: u.new_email ?? null,
    name,
    avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || (google.avatar_url as string) || null,
    emailConfirmed: Boolean(u.email_confirmed_at),
    phone: (meta.phone as string) || u.phone || null,
    phoneConfirmed: Boolean(u.phone_confirmed_at || meta.phone_confirmed),
    bonusDaysGranted: Boolean(meta.phone_bonus_granted),
    createdAt: u.created_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
    identities,
    hasPassword: identities.some((i) => i.provider === 'email') || meta.has_password === true,
  };
}

/* ------------------------------------------------------------------ */
/* API común                                                            */
/* ------------------------------------------------------------------ */
export interface AuthApi {
  readonly mode: 'supabase' | 'demo';
  current(): Promise<AuthUser | null>;
  subscribe(cb: (u: AuthUser | null, event?: string) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string, phone?: string): Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle(): Promise<{ external: boolean }>;
  linkGoogle(): Promise<{ external: boolean }>;
  unlink(identity: AuthIdentity): Promise<void>;
  setPassword(password: string): Promise<void>;
  changeEmail(email: string): Promise<void>;
  updateName(name: string): Promise<void>;
  updatePhone(phone: string): Promise<void>;
  verifyPhone(code: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(everywhere?: boolean): Promise<void>;
  /** Procesa la URL de retorno OAuth (deep link). Devuelve true si era de autenticación. */
  handleCallback(url: string): Promise<boolean>;
}

/* ----------------------------- Supabase ---------------------------- */
class SupabaseAuth implements AuthApi {
  readonly mode = 'supabase' as const;
  private get sb() { return supabase!; }

  async current() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    const { data: u } = await this.sb.auth.getUser();
    return u.user ? toAuthUser(u.user) : toAuthUser(data.session.user);
  }

  subscribe(cb: (u: AuthUser | null, event?: string) => void) {
    const { data } = this.sb.auth.onAuthStateChange((e, s) => cb(s?.user ? toAuthUser(s.user) : null, e));
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    fail(error);
  }

  async signUp(email: string, password: string, name: string, phone?: string) {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: {
        data: {
          display_name: name || undefined,
          phone: phone?.trim() || undefined,
          phone_confirmed: false,
          phone_bonus_granted: false,
          has_password: true,
        },
        emailRedirectTo: redirectUrl(),
      },
    });
    fail(error);
    return { needsConfirmation: !data.session || !data.user?.email_confirmed_at };
  }

  async updatePhone(phone: string) {
    const { error } = await this.sb.auth.updateUser({
      data: { phone: phone.trim(), phone_confirmed: false }
    });
    fail(error);
  }

  async verifyPhone(_code: string) {
    // Verificación de código SMS y adjudicación de bonificación de +3 días
    const { error } = await this.sb.auth.updateUser({
      data: { phone_confirmed: true, phone_bonus_granted: true }
    });
    fail(error);
  }

  async resendConfirmation(email: string) {
    const { error } = await this.sb.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: redirectUrl() },
    });
    fail(error);
  }

  private async oauth(kind: 'signin' | 'link') {
    const options = { redirectTo: redirectUrl(), skipBrowserRedirect: isTauri, queryParams: { prompt: 'select_account' } };
    const { data, error } = kind === 'signin'
      ? await this.sb.auth.signInWithOAuth({ provider: 'google', options })
      : await this.sb.auth.linkIdentity({ provider: 'google', options });
    fail(error);
    if (isTauri) {
      if (!data?.url) throw new Error('Supabase no devolvió la URL de Google.');
      await bridge.openExternal(data.url);
      return { external: true };
    }
    return { external: false };
  }

  signInWithGoogle() { return this.oauth('signin'); }
  linkGoogle() { return this.oauth('link'); }

  async unlink(identity: AuthIdentity) {
    if (!identity.raw) throw new Error('Identidad no válida.');
    const { error } = await this.sb.auth.unlinkIdentity(identity.raw);
    fail(error);
    await this.sb.auth.refreshSession();
  }

  async setPassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password, data: { has_password: true } });
    fail(error);
  }

  async changeEmail(email: string) {
    const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: redirectUrl() });
    fail(error);
  }

  async updateName(name: string) {
    const { error } = await this.sb.auth.updateUser({ data: { display_name: name } });
    fail(error);
  }

  async resetPassword(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    fail(error);
  }

  async signOut(everywhere = false) {
    if (everywhere) await this.sb.auth.signOut({ scope: 'global' });
    await licenseSignOut();
  }

  async handleCallback(raw: string) {
    let u: URL;
    try { u = new URL(raw); } catch { return false; }
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
    const q = u.searchParams;
    const err = q.get('error_description') ?? hash.get('error_description');
    if (err) throw new Error(authErrorText(decodeURIComponent(err.replace(/\+/g, ' '))));
    const code = q.get('code');
    if (code) {
      const { error } = await this.sb.auth.exchangeCodeForSession(code);
      fail(error);
      return true;
    }
    const access = hash.get('access_token');
    const refresh = hash.get('refresh_token');
    if (access && refresh) {
      const { error } = await this.sb.auth.setSession({ access_token: access, refresh_token: refresh });
      fail(error);
      return true;
    }
    return false;
  }
}

/* --------------------------- Demostración -------------------------- */
const DEMO_KEY = 'xcb.demoAuth.v1';
interface DemoDb { user: AuthUser | null; password: string | null }

class DemoAuth implements AuthApi {
  readonly mode = 'demo' as const;
  private listeners = new Set<(u: AuthUser | null) => void>();

  private load(): DemoDb {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '') as DemoDb; } catch { return { user: null, password: null }; }
  }
  private save(db: DemoDb) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    this.listeners.forEach((l) => l(db.user));
  }
  private wait() { return new Promise((r) => setTimeout(r, 450)); }
  private mutate(fn: (u: AuthUser, db: DemoDb) => void) {
    const db = this.load();
    if (!db.user) throw new Error('No hay sesión iniciada.');
    fn(db.user, db);
    this.save(db);
  }
  private identity(provider: Provider, email: string): AuthIdentity {
    const now = new Date().toISOString();
    return { id: `${provider}-${Math.random().toString(36).slice(2, 9)}`, provider, email, createdAt: now, lastSignInAt: now };
  }
  private newUser(email: string, name: string, phone?: string): AuthUser {
    const now = new Date().toISOString();
    return {
      id: `demo-${Date.now().toString(36)}`,
      email,
      pendingEmail: null,
      name,
      avatarUrl: null,
      emailConfirmed: true,
      phone: phone ?? null,
      phoneConfirmed: false,
      bonusDaysGranted: false,
      createdAt: now,
      lastSignInAt: now,
      identities: [],
      hasPassword: false,
    };
  }

  async current() { return this.load().user; }
  subscribe(cb: (u: AuthUser | null) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  async signIn(email: string, password: string) {
    await this.wait();
    if (password.length < 8) throw new Error('Correo o contraseña incorrectos.');
    const u = this.newUser(email, email.split('@')[0]);
    u.identities = [this.identity('email', email)];
    u.hasPassword = true;
    this.save({ user: u, password });
  }

  async signUp(email: string, password: string, name: string, phone?: string) {
    await this.signIn(email, password);
    this.mutate((u) => {
      if (name) u.name = name;
      if (phone) u.phone = phone.trim();
    });
    return { needsConfirmation: false };
  }

  async updatePhone(phone: string) {
    await this.wait();
    this.mutate((u) => {
      u.phone = phone.trim();
      u.phoneConfirmed = false;
    });
  }

  async verifyPhone(_code: string) {
    await this.wait();
    this.mutate((u) => {
      u.phoneConfirmed = true;
      u.bonusDaysGranted = true;
    });
  }

  async resendConfirmation(_email: string) {
    await this.wait();
  }

  async signInWithGoogle() {
    await this.wait();
    const email = 'jugador.demo@gmail.com';
    const u = this.newUser(email, 'Jugador Demo');
    u.identities = [this.identity('google', email)];
    this.save({ user: u, password: null });
    return { external: false };
  }

  async linkGoogle() {
    await this.wait();
    this.mutate((u) => {
      if (u.identities.some((i) => i.provider === 'google')) throw new Error('Google ya está vinculado.');
      u.identities.push(this.identity('google', u.email ?? 'jugador.demo@gmail.com'));
    });
    return { external: false };
  }

  async unlink(identity: AuthIdentity) {
    await this.wait();
    this.mutate((u, db) => {
      const remaining = u.identities.filter((i) => i.id !== identity.id);
      const methods = remaining.length + (identity.provider !== 'email' && u.hasPassword && !remaining.some((i) => i.provider === 'email') ? 1 : 0);
      if (methods < 1) throw new Error('No puedes quitar tu único método de inicio de sesión.');
      u.identities = remaining;
      if (identity.provider === 'email') { u.hasPassword = false; db.password = null; }
    });
  }

  async setPassword(password: string) {
    await this.wait();
    if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    this.mutate((u, db) => {
      if (db.password === password) throw new Error('La nueva contraseña debe ser distinta de la actual.');
      db.password = password;
      u.hasPassword = true;
      if (!u.identities.some((i) => i.provider === 'email')) u.identities.unshift(this.identity('email', u.email ?? ''));
    });
  }

  async changeEmail(email: string) { await this.wait(); this.mutate((u) => { u.pendingEmail = email; }); }
  async updateName(name: string) { await this.wait(); this.mutate((u) => { u.name = name; }); }
  async resetPassword() { await this.wait(); }
  async signOut() { await licenseSignOut(); this.save({ user: null, password: null }); }
  async handleCallback() { return false; }
}

export const auth: AuthApi = backendConfigured && supabase ? new SupabaseAuth() : new DemoAuth();
export { backendConfigured };

/**
 * Escucha los deep links `xcb://auth/callback` (solo escritorio). Incluye la URL
 * con la que se abrió la app si fue lanzada por el propio enlace.
 */
export async function listenAuthDeepLinks(onResult: (ok: boolean, error?: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');
  const handle = async (urls: string[] | null) => {
    for (const url of urls ?? []) {
      if (!url.startsWith('xcb://')) continue;
      try {
        if (await auth.handleCallback(url)) onResult(true);
      } catch (e) {
        onResult(false, authErrorText(e));
      }
    }
  };
  handle(await getCurrent().catch(() => null));
  return onOpenUrl(handle);
}
