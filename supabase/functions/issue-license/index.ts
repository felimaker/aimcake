// Supabase Edge Function: issue-license
// Valida el HWID contra la base de datos (trial único de 3 días) y emite un
// token de licencia firmado con Ed25519 que el cliente Rust verifica offline.
//
// Secrets requeridos:  supabase secrets set LICENSE_PRIVATE_KEY_HEX=<64 hex>
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ed25519 } from 'npm:@noble/curves@1.6.0/ed25519';
import { corsHeaders, json } from '../_shared/http.ts';

/** Validez máxima de un token "active" antes de exigir revalidación online. */
const ACTIVE_TOKEN_TTL = 7 * 86400;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('LICENSE_PRIVATE_KEY_HEX inválida');
  return Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ allowed: false, reason: 'Método no permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ allowed: false, reason: 'No autenticado' }, 401);

    const { hwid } = await req.json().catch(() => ({}));
    if (typeof hwid !== 'string' || !/^[0-9a-f]{64}$/.test(hwid)) {
      return json({ allowed: false, reason: 'HWID inválido' }, 400);
    }

    // Cliente con el JWT del usuario: auth.uid() funciona dentro del RPC.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ allowed: false, reason: 'Sesión inválida' }, 401);

    const { data, error } = await supabase.rpc('register_or_validate_device', { device_hwid: hwid });
    if (error) return json({ allowed: false, reason: error.message }, 400);
    if (!data?.allowed) return json({ allowed: false, reason: data?.reason ?? 'Licencia denegada' });

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = data.status === 'active' ? Math.min(Number(data.expires_at), now + ACTIVE_TOKEN_TTL) : Number(data.expires_at);

    // El orden de las claves es irrelevante: se firma la cadena exacta que recibe el cliente.
    const payload = JSON.stringify({
      user_id: userData.user.id,
      hwid,
      expires_at: expiresAt,
      status: data.status,
    });

    const privateKey = hexToBytes(Deno.env.get('LICENSE_PRIVATE_KEY_HEX') ?? '');
    const signature = ed25519.sign(new TextEncoder().encode(payload), privateKey);

    return json({ allowed: true, payload, signature: toBase64(signature) });
  } catch (e) {
    console.error(e);
    return json({ allowed: false, reason: 'Error interno del servidor de licencias' }, 500);
  }
});
