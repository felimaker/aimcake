import { useCallback, useEffect, useState } from 'react';
import { auth, authErrorText, listenAuthDeepLinks, type AuthIdentity, type AuthUser } from '../services/authService';

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Acción en curso (para mostrar spinners en el botón correspondiente). */
  pending: string | null;
  error: string | null;
  info: string | null;
  mode: 'supabase' | 'demo';
  isRecovery: boolean;
  setIsRecovery: (v: boolean) => void;
  clearMessages: () => void;
  reload: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, name: string, phone?: string) => Promise<boolean>;
  google: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  unlink: (i: AuthIdentity) => Promise<void>;
  setPassword: (pw: string) => Promise<boolean>;
  changeEmail: (email: string) => Promise<boolean>;
  updateName: (name: string) => Promise<boolean>;
  updatePhone: (phone: string) => Promise<boolean>;
  verifyPhone: (code: string) => Promise<boolean>;
  resendConfirmation: (email?: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState<boolean>(() => {
    return typeof window !== 'undefined' && (
      window.location.hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery')
    );
  });

  const reload = useCallback(async () => setUser(await auth.current()), []);

  useEffect(() => {
    let alive = true;
    auth.current().then((u) => { if (alive) { setUser(u); setLoading(false); } }).catch(() => setLoading(false));
    // Al cambiar la sesión se vuelve a pedir el usuario para tener las identidades al día.
    const off = auth.subscribe((u, event) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        setInfo('Sesión de recuperación iniciada. Introduce tu nueva contraseña a continuación.');
      }
      setUser(u);
      if (u) auth.current().then((x) => alive && x && setUser(x));
    });
    const offLink = listenAuthDeepLinks((ok, err) => {
      setPending(null);
      if (ok) { setError(null); setInfo('Cuenta conectada correctamente.'); reload(); }
      else setError(err ?? 'No se pudo completar el inicio de sesión.');
    });
    return () => { alive = false; off(); offLink.then((f) => f()); };
  }, [reload]);

  /** Ejecuta una acción con estado de carga y mensajes. */
  const run = useCallback(async (key: string, fn: () => Promise<string | void>): Promise<boolean> => {
    setError(null); setInfo(null); setPending(key);
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
      return true;
    } catch (e) {
      setError(authErrorText(e));
      return false;
    } finally {
      setPending((p) => (p === key ? null : p));
    }
  }, []);

  const external = 'Continúa en el navegador que se ha abierto. Al terminar volverás automáticamente a la app.';

  return {
    user, loading, pending, error, info, mode: auth.mode,
    isRecovery, setIsRecovery,
    clearMessages: () => { setError(null); setInfo(null); },
    reload,
    signIn: (e, p) => run('signin', () => auth.signIn(e.trim(), p)),
    signUp: (e, p, n, ph) => run('signup', async () => {
      const r = await auth.signUp(e.trim(), p, n.trim(), ph);
      return r.needsConfirmation ? `Te enviamos un correo de confirmación a ${e.trim()}. Por favor, verifícalo para activar tu cuenta.` : 'Cuenta creada. ¡Bienvenido!';
    }),
    google: async () => { await run('google', async () => { const r = await auth.signInWithGoogle(); if (r.external) return external; }); },
    linkGoogle: async () => {
      await run('link-google', async () => {
        const r = await auth.linkGoogle();
        if (r.external) return external;
        await reload();
        return 'Cuenta de Google vinculada.';
      });
    },
    unlink: async (i) => { await run(`unlink-${i.id}`, async () => { await auth.unlink(i); await reload(); return i.provider === 'google' ? 'Google desvinculado de tu cuenta.' : 'Método eliminado.'; }); },
    setPassword: (pw) => run('password', async () => {
      const had = user?.hasPassword;
      await auth.setPassword(pw);
      await reload();
      return had ? 'Contraseña actualizada.' : 'Contraseña creada: ya puedes entrar con tu correo y contraseña.';
    }),
    changeEmail: (email) => run('email', async () => {
      await auth.changeEmail(email.trim());
      await reload();
      return `Te enviamos un enlace de confirmación a ${email.trim()} (y a tu correo actual).`;
    }),
    updateName: (name) => run('name', async () => { await auth.updateName(name.trim()); await reload(); return 'Nombre actualizado.'; }),
    updatePhone: (phone) => run('phone', async () => {
      await auth.updatePhone(phone);
      await reload();
      return 'Número de teléfono guardado. Ahora puedes verificarlo para obtener +3 días gratis.';
    }),
    verifyPhone: (code) => run('verify-phone', async () => {
      await auth.verifyPhone(code);
      await reload();
      return '¡Teléfono verificado con éxito! Se han añadido +3 días gratis a tu periodo de prueba.';
    }),
    resendConfirmation: (email) => run('resend-email', async () => {
      const target = email || user?.email;
      if (!target) throw new Error('No hay correo disponible para reenviar.');
      await auth.resendConfirmation(target);
      return `Enlace de confirmación reenviado a ${target}. Revisa tu bandeja de entrada o spam.`;
    }),
    resetPassword: async (email) => { await run('reset', async () => { await auth.resetPassword(email.trim()); return `Si existe una cuenta para ${email.trim()}, recibirás un enlace para restablecer la contraseña.`; }); },
    signOut: async (everywhere) => { await run('signout', async () => { await auth.signOut(everywhere); setUser(null); }); },
  };
}
