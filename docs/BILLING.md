# Turning on plans and billing

Billing is off. Until you switch it on, every team has every feature and nobody sees a checkout.

What's built:
- `public.subscriptions` and `public.team_plan(team)` in `supabase/schema.sql`. The database itself enforces roster size (free 15, Team 40, School unlimited) and the school view. Hiding buttons in the app is not the lock.
- `supabase/functions/billing`: Stripe Checkout, the customer portal and the webhook that updates `subscriptions`.
- Settings › Plan in the app, with the plans and Upgrade buttons.

## Steps (when you're ready to charge)

1. Create a Stripe account (needs an adult account holder and ideally your LLC's bank account).
2. In Stripe, create products and prices: Athlete Plus monthly, Team monthly, Team per season, School yearly. Copy each price id (`price_...`).
3. Deploy the function: `supabase functions deploy billing --no-verify-jwt`.
4. Supabase › Edge Functions › Secrets: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PLUS_MONTH`, `STRIPE_PRICE_TEAM_MONTH`, `STRIPE_PRICE_TEAM_SEASON`, `STRIPE_PRICE_SCHOOL_YEAR`, `APP_URL` (your app's address).
5. Stripe › Developers › Webhooks: add `https://<project>.supabase.co/functions/v1/billing/webhook` for `customer.subscription.*` events and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
6. For founding-team prices, make a Stripe promotion code (checkout accepts codes).
7. When everything works in Stripe test mode, run in the SQL editor:
   `update app_config set billing_enabled = true;`

To switch it off again: `update app_config set billing_enabled = false;`
