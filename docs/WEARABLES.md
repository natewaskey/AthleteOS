# Setting up wearable sync (WHOOP, Garmin, Oura, Polar)

Athletes connect their devices in **Settings › Devices**. After a one-time sign-in, sleep, HRV, resting heart rate, recovery and workouts sync on their own.

The setup has three parts: the database, the `wearables` server function, and one free developer app per brand. You only need to set up the brands you want. A brand with no keys just shows "isn't set up on the server yet" when someone taps Connect.

Your Supabase project's function address is:

```
https://rpvwbmuwchhihosryhjn.supabase.co/functions/v1/wearables
```

Below, `FN` means that address.

## 1. Database

In Supabase, open **SQL Editor**, paste all of `supabase/schema.sql` and press **Run**. This is safe to run again. It adds the `wearable_connections`, `wearable_states` and `wearable_data` tables and the `wearable_status` function.

## 2. The server function

1. Install the Supabase CLI (`brew install supabase/tap/supabase`, or `npm i -g supabase`), then run `supabase login`.
2. From the repo folder, run:

   ```
   supabase functions deploy wearables --project-ref rpvwbmuwchhihosryhjn --no-verify-jwt
   ```

   This uploads `supabase/functions/wearables/index.ts` and `map.mjs` together.
3. In the dashboard, go to **Edge Functions › wearables › Details** and check that **Verify JWT** is OFF. Brand sign-in pages and webhooks call it without a Supabase login, so the function checks the caller itself.
4. Go to **Edge Functions › Secrets** and add `APP_URL` = `https://natewaskey.github.io/AthleteOS/` (or your custom domain). This is where athletes land after signing in to a brand.

To deploy from the dashboard editor instead, create a function named `wearables` with two files: `index.ts` and `map.mjs`, copied from `supabase/functions/wearables/`.

## 3. Each brand

For every brand you register, use these addresses:

- **Redirect / callback URL:** `FN/callback/<brand>`, for example `FN/callback/whoop`
- **Webhook URL (optional):** `FN/webhook/<brand>`

Webhooks are optional. Without them, the athlete's app asks the server to pull new data whenever it is opened and the last sync is over 3 hours old. With them, data arrives within minutes, even if the app is closed.

### WHOOP

1. Go to [developer.whoop.com](https://developer.whoop.com), sign in with a WHOOP account and create a team, then an app.
2. Scopes: tick `read:recovery`, `read:sleep`, `read:workout`, `read:cycles`, `read:profile` and `offline`.
3. Redirect URL: `FN/callback/whoop`.
4. Optional webhook URL: `FN/webhook/whoop` (v2). It is checked with the client secret, so it needs nothing else.
5. Add the secrets `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET`.
6. New apps work for 10 WHOOP members. When you're ready for more, submit the app for review in the dashboard.

### Garmin

1. Apply for the [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/). The Startup tier is free up to 1,000 users. Ask for the **Health API** and the **Activity API**.
2. Once approved, create an app in the developer portal and set the redirect URL to `FN/callback/garmin`.
3. Choose a long random word as a webhook key (any password generator works). In **Endpoint Configuration**, set **Dailies**, **Sleeps**, **HRV Summary**, **Activities** and **Deregistrations** to **push**, with the URL `FN/webhook/garmin?key=<your key>`.
4. Add the secrets `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` and `GARMIN_WEBHOOK_KEY` (the same key).

Garmin sends most data by push, so the webhook is strongly recommended for Garmin. Pulling without it only covers the last 3 days.

### Oura

1. Go to [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications) and create an app.
2. Redirect URI: `FN/callback/oura`. Scopes: `personal`, `daily`, `heartrate`, `workout`.
3. Add the secrets `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`.
4. Optional webhooks: add a secret `OURA_WEBHOOK_TOKEN` (any random word). Then create one subscription per data type (`daily_readiness`, `sleep`, `workout`):

   ```
   curl -X POST https://api.ouraring.com/v2/webhook/subscription \
     -H "x-client-id: <OURA_CLIENT_ID>" -H "x-client-secret: <OURA_CLIENT_SECRET>" -H "Content-Type: application/json" \
     -d '{"callback_url":"FN/webhook/oura","verification_token":"<OURA_WEBHOOK_TOKEN>","event_type":"create","data_type":"daily_readiness"}'
   ```

   Oura subscriptions expire after 90 days. Renew them, or rely on pull-on-open.

### Polar

1. Go to [admin.polaraccesslink.com](https://admin.polaraccesslink.com), sign in with a Polar Flow account and create a client.
2. Redirect URL: `FN/callback/polar`.
3. Add the secrets `POLAR_CLIENT_ID` and `POLAR_CLIENT_SECRET`.
4. Optional webhook (one per client), using the Basic auth of your client ID and secret:

   ```
   curl -X POST https://www.polaraccesslink.com/v3/webhooks -u "<POLAR_CLIENT_ID>:<POLAR_CLIENT_SECRET>" \
     -H "Content-Type: application/json" -d '{"events":["EXERCISE","SLEEP"],"url":"FN/webhook/polar"}'
   ```

   The answer includes a `signature_secret_key`. Save it as the secret `POLAR_WEBHOOK_SECRET`.

## 4. Test it

1. Sign in to Motiq as an athlete on a team, then go to **Settings › Devices** and tap **Connect** on your brand.
2. Approve on the brand's page. You come back to Motiq with "connected" and the last 30 days sync.
3. Check the check-in (sleep, HRV and resting HR pre-filled), History (synced workouts) and, as the coach, the athlete's page (Devices card).

If something fails, **Edge Functions › wearables › Logs** shows the reason. The Devices card also shows the last error per brand.

## What syncs

| Brand | Daily | Workouts |
| --- | --- | --- |
| WHOOP | Recovery, HRV, resting HR, sleep time and performance | Sport, duration, distance, heart rate, strain, calories |
| Garmin | Resting HR, sleep time and score, overnight HRV | Type, duration, distance, heart rate, calories |
| Oura | Readiness, sleep time, HRV, lowest night HR | Activity, duration, distance, calories |
| Polar | Nightly Recharge (HRV, night HR, status), sleep time and score | Sport, duration, distance, heart rate, calories |

Device numbers are stored as metrics (`hrv`, `rhr`, `sleep`, `recovery`) with the brand as their source, so baselines, readiness and the coach view use them like any other data. Synced workouts get an RPE estimated from heart rate, which athletes can edit.
