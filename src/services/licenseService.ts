/**
 * Servicio de licencias: autenticación Supabase + emisión de tokens Ed25519
 * (Edge Function `issue-license`) + checkout de Stripe (`create-checkout`).
 */
import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { LicenseToken } from '../types';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const backendConfigured = Boolean(url && anonKey && !url.includes('TU-PROYECTO'));

export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // PKCE: el proveedor OAuth devuelve `?code=` que se canjea por la sesión
      // (en escritorio llega por el deep link `xcb://auth/callback`).
      flowType: 'pkce',
      detectSessionInUrl: !inTauri,
    },
  })
  : null;

const TOKEN_KEY = 'xcb.licenseToken';

export function loadCachedToken(): LicenseToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as LicenseToken) : null;
  } catch {
    return null;
  }
}

export function saveCachedToken(token: LicenseToken | null) {
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  else localStorage.removeItem(TOKEN_KEY);
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (s: Session | null, event: AuthChangeEvent) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((e, s) => cb(s, e));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Servidor de licencias no configurado.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Servidor de licencias no configurado.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  saveCachedToken(null);
  if (supabase) await supabase.auth.signOut();
}

interface IssueResponse {
  allowed: boolean;
  payload?: string;
  signature?: string;
  reason?: string;
}

/** Registra el HWID (trial único de 3 días) y obtiene un token firmado por el servidor. */
export async function requestLicense(hwid: string): Promise<LicenseToken> {
  if (!supabase) throw new Error('Servidor de licencias no configurado.');
  const { data, error } = await supabase.functions.invoke<IssueResponse>('issue-license', { body: { hwid } });
  if (error) throw new Error(error.message);
  if (!data?.allowed || !data.payload || !data.signature) {
    throw new Error(data?.reason ?? 'Licencia denegada por el servidor.');
  }
  const token = { payload: data.payload, signature: data.signature };
  saveCachedToken(token);
  return token;
}

/** Crea una sesión de Stripe Checkout para la suscripción y devuelve su URL. */
export async function createCheckout(hwid: string): Promise<string> {
  if (!supabase) throw new Error('Servidor de licencias no configurado.');
  const { data, error } = await supabase.functions.invoke<{ url: string }>('create-checkout', { body: { hwid } });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('No se pudo crear la sesión de pago.');
  return data.url;
}

/** Token local sin firma real (solo aceptado por compilaciones debug del backend). */
export function createDevToken(hwid: string): LicenseToken {
  const payload = JSON.stringify({
    user_id: 'dev-local',
    hwid,
    expires_at: Math.floor(Date.now() / 1000) + 3 * 86400,
    status: 'trial',
  });
  return { payload, signature: 'DEV' };
}
