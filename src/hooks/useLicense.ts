import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { LicensePayload, LicenseToken } from '../types';
import { bridge } from '../services/tauriBridge';
import {
  backendConfigured,
  createCheckout,
  createDevToken,
  getSession,
  loadCachedToken,
  onAuthChange,
  requestLicense,
  saveCachedToken,
  signIn,
  signOut,
  signUp,
} from '../services/licenseService';

export interface LicenseState {
  session: Session | null;
  token: LicenseToken | null;
  payload: LicensePayload | null;
  error: string | null;
  info: string | null;
  busy: boolean;
  checking: boolean;
  backendConfigured: boolean;
  login: (email: string, password: string, mode: 'login' | 'register') => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  activateDev: () => Promise<void>;
  subscribe: () => Promise<void>;
}

export function useLicense(hwid: string): LicenseState {
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<LicenseToken | null>(null);
  const [payload, setPayload] = useState<LicensePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const adopt = useCallback(async (t: LicenseToken) => {
    const p = await bridge.verifyLicense(t.payload, t.signature);
    setToken(t);
    setPayload(p);
    saveCachedToken(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!hwid) return;
    setError(null);
    setBusy(true);
    try {
      await adopt(await requestLicense(hwid));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }, [hwid, adopt]);

  // Arranque: token en caché -> verificación local; luego revalidación online.
  useEffect(() => {
    if (!hwid) return;
    let cancelled = false;
    let lastUser: string | null = null;
    (async () => {
      const cached = loadCachedToken();
      if (cached) {
        try { await adopt(cached); } catch { saveCachedToken(null); }
      }
      const s = await getSession();
      if (cancelled) return;
      setSession(s);
      lastUser = s?.user.id ?? null;
      if (s) {
        try { await adopt(await requestLicense(hwid)); } catch (e) { if (!cached) setError(String((e as Error).message)); }
      }
      setChecking(false);
    })();
    // La licencia queda ligada a la cuenta: cada vez que entra un usuario nuevo
    // (correo, Google o deep link) se pide el token de este equipo para él.
    const off = onAuthChange((s, event) => {
      setSession(s);
      if (event === 'INITIAL_SESSION') return;
      const uid = s?.user.id ?? null;
      if (event === 'SIGNED_OUT' || !uid) { lastUser = null; setToken(null); setPayload(null); return; }
      if (uid !== lastUser) {
        lastUser = uid;
        requestLicense(hwid).then(adopt).catch((e) => setError(String((e as Error).message ?? e)));
      }
    });
    return () => { cancelled = true; off(); };
  }, [hwid, adopt]);

  const login = useCallback(async (email: string, password: string, mode: 'login' | 'register') => {
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'register') {
        const r = await signUp(email, password);
        if (r.needsConfirmation) { setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.'); return; }
      } else {
        await signIn(email, password);
      }
      setSession(await getSession());
      await adopt(await requestLicense(hwid));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }, [hwid, adopt]);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null); setToken(null); setPayload(null);
  }, []);

  const activateDev = useCallback(async () => {
    setError(null);
    try { await adopt(createDevToken(hwid)); setInfo('Licencia de desarrollo local activada (solo compilaciones debug).'); }
    catch (e) { setError(String((e as Error).message ?? e)); }
  }, [hwid, adopt]);

  const subscribe = useCallback(async () => {
    setError(null); setBusy(true);
    try {
      const url = await createCheckout(hwid);
      await bridge.openExternal(url);
      setInfo('Completa el pago en tu navegador y pulsa "Revalidar" al terminar.');
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }, [hwid]);

  return { session, token, payload, error, info, busy, checking, backendConfigured, login, logout, refresh, activateDev, subscribe };
}
