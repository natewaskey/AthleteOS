# Cloud setup (accounts, sync, Claude without a key)

The app talks to the Supabase project in `src/cloud-config.js`. These steps happen once, in the
Supabase dashboard. Nothing here needs a terminal.

## 1. Create the database (2 minutes)

1. Open the project, then **SQL Editor → New query**.
2. Paste all of `supabase/schema.sql` and press **Run**. You should see "Success. No rows returned".
   Running it again later is safe.

## 2. Sign-in settings (1 minute)

1. **Authentication → Sign In / Providers → Email**: leave Email on.
   - For quick testing you can turn **Confirm email** off. Leave it on for real athletes.
2. **Authentication → URL Configuration**: set **Site URL** to the address the app is served from
   (for example `https://yourname.github.io/AthleteOS/`) and add the same address under
   **Redirect URLs**. Confirmation and password-reset emails open this address.

## 3. Claude for the whole team (5 minutes, optional)

1. Get an API key at console.anthropic.com. Don't paste it into the app or a chat.
2. **Edge Functions → Secrets**: add `ANTHROPIC_API_KEY` with the key. Optionally add
   `AI_DAILY_LIMIT` (requests per team per day, default 200).
3. **Edge Functions → Deploy a new function → Via editor**: name it `claude`, replace the
   sample code with `supabase/functions/claude/index.ts`, and deploy.
4. In the function's **Details / Settings**, turn **Verify JWT** off. The function checks the
   sign-in itself (this is needed with the new `sb_publishable_` keys).

Anyone signed in to a team then gets Claude without adding a key. Usage per team per day is in
the `ai_usage` table.

## How it works

- **Coach**: Settings → Account & sync → create an account → **Put team online**. This uploads the
  roster and everything on that device, and shows two codes: one for athletes, one for coaches.
- **Athletes already on the roster**: the coach taps **Get code** next to their name. The athlete
  signs in on their phone and joins with that code, which links them to their own history.
- **New athletes**: join with the team code and add their name.
- **Training solo**: Settings → **Back up and sync my training**.
- Any other phone: sign in to the same account and open the team.

The app keeps working offline and syncs when it's back online (after each change, every 30 seconds
while open, and when reopened). If two phones edit the same item, the last one to sync wins.

## Privacy

Enforced by the database, not just the app:

- Athletes only receive their own records and team-wide ones (templates, programs, events).
  Teammates show up as a name and sport only. Their check-ins, sessions and messages never reach
  other athletes' phones.
- Check-in notes an athlete chose not to share, and cycle data unless shared, are stored in a
  record only that athlete's login can read. The coach's copy doesn't have them.
- Athletes can only change their own records. Only coaches change team-wide items.
- An under-18 athlete's own logs aren't uploaded until a parent or guardian approves sharing in Settings. They still receive their coach's workouts and messages.

Video files stay on the phone that recorded them. Form-check results sync.
