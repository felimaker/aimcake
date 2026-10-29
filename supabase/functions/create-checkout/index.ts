// Supabase Edge Function: create-checkout
// Crea una sesión de Stripe Checkout (suscripción) vinculada al usuario y HWID.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, CHECKOUT_SUCCESS_URL (opcional), CHECKOUT_CANCEL_URL (opcional)
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autenticado' }, 401);

    const { hwid } = await req.json().catch(() => ({}));
    if (typeof hwid !== 'string' || !/^[0-9a-f]{64}$/.test(hwid)) return json({ error: 'HWID inválido' }, 400);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    // El dispositivo debe estar registrado y pertenecer al usuario.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: license } = await admin.from('licenses').select('*').eq('hwid', hwid).maybeSingle();
    if (!license || license.user_id !== user.id) return json({ error: 'Dispositivo no registrado para esta cuenta' }, 403);

    let customerId: string | null = license.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customerId = customer.id;
      await admin.from('licenses').update({ stripe_customer_id: customerId }).eq('id', license.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      client_reference_id: license.id,
      metadata: { user_id: user.id, hwid, license_id: license.id },
      subscription_data: { metadata: { user_id: user.id, hwid, license_id: license.id } },
      success_url: Deno.env.get('CHECKOUT_SUCCESS_URL') ?? 'https://stripe.com/success',
      cancel_url: Deno.env.get('CHECKOUT_CANCEL_URL') ?? 'https://stripe.com/cancel',
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo crear la sesión de pago' }, 500);
  }
});
