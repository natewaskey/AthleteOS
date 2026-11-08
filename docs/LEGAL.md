# Legal setup for Motiq 1.0

This is a checklist, not legal advice. Have a lawyer review the privacy policy and terms before Motiq takes money or signs up teams you don't know (a one-time review usually costs a few hundred dollars).

## Fill in before sharing the app widely

| Where | What to add |
|---|---|
| `privacy.html` and `terms.html`, contact email | Set to waskey@toptierwins.com (2026-11-08). Change it if you get a dedicated address. |
| `terms.html`, governing law | Set to Nevada (2026-11-08). Update it if you move or form an LLC elsewhere. |
| Both pages, "Effective" date and version | Change when you edit them, and bump `VERSION` in `src/legal.js` so everyone is asked to accept the new version. |

## What the app now does

- **Age rules (COPPA):** own accounts need a birth month and year showing 13+. Under 13 can only be set up by a parent ("I'm a parent setting this up for my child"). Recorded in `settings.legal` with the terms version.
- **Parent consent for under-18s:** existing parent account and code flow; coaches can't read a minor's health and training records until a parent approves (enforced in the database).
- **Health data consent:** asked once, required to use check-ins and injuries. Matters for Washington's My Health My Data Act and similar state laws.
- **Privacy policy and terms:** `privacy.html`, `terms.html`, linked from sign-in, the welcome screen and the trust center, and cached for offline use.
- **Trust center:** Settings › Privacy and data. What's kept, who sees it, download, delete.
- **Delete my account:** removes shared videos from Storage, then calls `delete_my_account()` which deletes the login and its cloud data (or the whole team if the caller is its only coach). Required by Google sign-in policy and both app stores.
- **No ads, no selling data, no third-party trackers.**

## After you merge

1. Supabase › SQL editor: run `supabase/schema.sql` again (safe to re-run). It adds account deletion, schools, plans, beta and feedback tables.
2. Test delete on a throwaway account.
3. Google Cloud console › OAuth consent screen: add the privacy policy and terms links (`https://natewaskey.github.io/AthleteOS/privacy.html` and `/terms.html`, or your domain).

## Protecting the idea (summary)

See the "Legal and protecting your idea" section of the Motiq 1.0 plan doc for the full version.

- Trademark "Motiq" (USPTO, about $350 per class; class 9 for software and 42 for software as a service).
- Keep the repo private and the proprietary license (already in `LICENSE`).
- Terms ban copying, reverse engineering, scraping and building a competing product (section 5).
- NDAs and a contractor IP assignment for anyone who helps build it.
- Form an LLC before taking payments.
- Patents are slow and expensive; only worth a conversation with a patent attorney if a specific method is truly new.
