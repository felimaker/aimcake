// Supabase Edge Function: stripe-webhook
// Sincroniza el estado de la suscripción de Stripe con la tabla `licenses`.
// Desplegar con:  supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
import Stripe from 'npm:stripe@16';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function syncSubscription(sub: Stripe.Subscription) {
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const update = {
    status: isActive ? 'active' : 'expired',
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const licenseId = sub.metadata?.license_id;
  const query = admin.from('licenses').update(update);
  const { error } = licenseId ? await query.eq('id', licenseId) : await query.eq('stripe_subscription_id', sub.id);
  if (error) throw error;
}

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('Falta la firma', { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider,
    );
  } catch (e) {
    return new Response(`Firma inválida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response('Error procesando el evento', { status: 500 });
  }
});
