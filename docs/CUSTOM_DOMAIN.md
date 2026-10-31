# Your own address for AthleteOS (optional)

Today the app lives at `https://natewaskey.github.io/AthleteOS/`. That link is permanent as long as the
repo keeps its name, GitHub Pages stays on, and the repo stays public (a private repo needs GitHub Pro
to keep Pages). A custom domain such as `athleteos.app` is only needed for a branded address.

The app already works on any address: links, sign-in redirects, the 404 page and the home-screen app
all use whatever address the app is opened from.

## 1. Buy the domain (about $10 to $15 a year)

Any registrar works. Cloudflare Registrar and Namecheap are simple and cheap.

## 2. Point it at GitHub Pages

In the domain's DNS settings add:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `natewaskey.github.io` |

(On Cloudflare, set these records to **DNS only**, the grey cloud, until GitHub has issued the certificate.)

Then in the repo: **Settings → Pages → Custom domain**, type the domain, **Save**. GitHub adds a
`CNAME` file to the branch. When the check turns green, tick **Enforce HTTPS** (it can take up to an hour).

## 3. Tell sign-in about the new address

- **Supabase → Authentication → URL Configuration**: set **Site URL** to `https://yourdomain/` and add
  `https://yourdomain/` under **Redirect URLs**. Keep the github.io address in the list too, so old
  links and installed apps still work while people move over.
- **Google Cloud console → APIs & Services → Credentials → your OAuth client**: add
  `https://yourdomain` under **Authorized JavaScript origins**. The redirect URI (the Supabase
  callback) doesn't change.

## 4. Moving people over

- Anyone signed in just signs in again at the new address; their data comes down from the cloud.
- Data kept only on a device (people who chose "Continue without an account") stays with the old
  address. Ask them to export it (Settings → Advanced → Export) and import it at the new address,
  or to sign in first.
- People who added the old address to their home screen should add the new one and delete the old icon.
