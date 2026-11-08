// Motiq: plans and billing (Supabase Edge Function named "billing"). OFF until Stripe is set up:
// with no STRIPE_SECRET_KEY it answers 503 and the app says billing isn't switched on.
// Turn "Verify JWT" OFF for this function (Stripe's webhook has no Supabase login); it checks callers itself.
//
// Routes (under /functions/v1/billing):
//   POST /checkout {team, plan, period}   signed-in coach (or solo athlete for "plus") -> { url } to Stripe Checkout
//   POST /portal {team}                   signed-in coach -> { url } to the Stripe customer portal (cancel, change card)
//   POST /webhook                         Stripe events: keeps public.subscriptions in step
//
// Secrets (Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_PLUS_MONTH, STRIPE_PRICE_TEAM_MONTH, STRIPE_PRICE_TEAM_SEASON, STRIPE_PRICE_SCHOOL_YEAR (Stripe price ids)
//   APP_URL: where Stripe sends people back, e.g. https://natewaskey.github.io/AthleteOS/
// Then set app_config.billing_enabled = true in the SQL editor to start enforcing plans.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@16.12.0';

const PRICES: Record<string, string | undefined> = {
  'plus:month': Deno.env.get('STRIPE_PRICE_PLUS_MONTH'),
  'team:month': Deno.env.get('STRIPE_PRICE_TEAM_MONTH'),
  'team:season': Deno.env.get('STRIPE_PRICE_TEAM_SEASON'),
  'school:year': Deno.env.get('STRIPE_PRICE_SCHOOL_YEAR'),
};

function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    Vary: 'Origin',
  };
}
const json = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json(req, 503, { error: 'Billing isn’t switched on yet.' });
  const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const path = new URL(req.url).pathname.replace(/^.*\/billing/, '');
  const appUrl = Deno.env.get('APP_URL') || req.headers.get('Origin') || '';

  if (path === '/webhook') {
    const sig = req.headers.get('stripe-signature') || '';
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(await req.text(), sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
    } catch {
      return json(req, 400, { error: 'Bad signature' });
    }
    if (event.type.startsWith('customer.subscription.')) {
      const s = event.data.object as Stripe.Subscription;
      const team = s.metadata.team, plan = s.metadata.plan;
      if (team && plan) {
        await admin.from('subscriptions').upsert({
          team_id: team,
          plan,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : s.status,
          current_period_end: new Date(s.current_period_end * 1000).toISOString(),
          stripe_customer: String(s.customer),
          stripe_subscription: s.id,
          updated_at: new Date().toISOString(),
        });
      }
    }
    return json(req, 200, { received: true });
  }

  // Everything else needs a signed-in member of the team.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json(req, 401, { error: 'Sign in first.' });
  const body = await req.json().catch(() => ({}));
  const { data: m } = await admin.from('team_members').select('role, teams(solo, name)').eq('team_id', body.team).eq('user_id', u.user.id).maybeSingle();
  const solo = !!(m as any)?.teams?.solo;
  if (!m || (m.role !== 'coach' && !(solo && body.plan === 'plus'))) return json(req, 403, { error: 'Only the team’s coach can manage its plan.' });

  if (path === '/checkout') {
    const price = PRICES[`${body.plan}:${body.period}`];
    if (!price) return json(req, 400, { error: 'That plan isn’t available.' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer_email: u.user.email,
      allow_promotion_codes: true, // founding-team codes
      subscription_data: { metadata: { team: body.team, plan: body.plan } },
      success_url: `${appUrl}#settings?billing=done`,
      cancel_url: `${appUrl}#settings`,
    });
    return json(req, 200, { url: session.url });
  }
  if (path === '/portal') {
    const { data: s } = await admin.from('subscriptions').select('stripe_customer').eq('team_id', body.team).maybeSingle();
    if (!s?.stripe_customer) return json(req, 404, { error: 'No paid plan on this team yet.' });
    const p = await stripe.billingPortal.sessions.create({ customer: s.stripe_customer, return_url: `${appUrl}#settings` });
    return json(req, 200, { url: p.url });
  }
  return json(req, 404, { error: 'Not found' });
});
