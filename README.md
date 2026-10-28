# PlotDesk waitlist (standalone, for Vercel)

A static page plus one serverless function. No build step, no framework.

```
index.html          the waitlist page
privacy.html        the short privacy page the form links to
styles.css app.js   styling and form logic
config.js           text and contact email: edit this
favicon.svg
vercel.json         security headers, clean URLs
api/waitlist.js     receives signups (Vercel serverless function)
setup/              NOT deployed: Apps Script code and a local test
```

## 1. Decide where signups are stored (about 10 minutes)

Signups must be saved somewhere you control. This page saves them to a **Google Sheet**
(durable, free, you can open it any time) and can also **email you a copy** with Resend.
Set up the sheet. The email is optional.

### Google Sheet
1. Create a new Google Sheet called "PlotDesk waitlist".
2. Extensions → Apps Script. Delete the sample code and paste in `setup/google-apps-script.gs`.
3. Project Settings (gear) → Script properties → Add: name `WAITLIST_SECRET`, value a long
   random string (you will use the same string in Vercel). Save.
4. Deploy → New deployment → type **Web app**. Execute as **Me**. Who has access **Anyone**.
   Deploy and approve the permissions. Copy the **Web app URL**.
   (After changing the script later: Deploy → Manage deployments → edit → New version.)

### Optional: an email for each signup (Resend)
Create a Resend account and an API key. Without a verified domain you can only send to your own
Resend account email, which is fine for notifying yourself.

## 2. Deploy

1. Put this folder in a Git repo and import it in Vercel (or run `vercel` from the folder).
   Framework preset: **Other**. No build command, output directory empty.
2. Project → Settings → Environment Variables (Production):
   - `WAITLIST_WEBHOOK_URL`    the Apps Script Web app URL
   - `WAITLIST_WEBHOOK_SECRET` the same value as `WAITLIST_SECRET`
   - `RESEND_API_KEY`          optional
   - `NOTIFY_EMAIL`            optional, where the copy goes
   - `RESEND_FROM`             optional, default `PlotDesk <onboarding@resend.dev>`
3. Redeploy so the variables apply.
4. Add your domain (for example `waitlist.plotdesk.co` or `plotdesk.co`) under Settings → Domains
   and add the DNS record Vercel shows (in Cloudflare, set it to "DNS only").
5. Test: submit the form yourself. A row should appear in the sheet.

If neither the sheet nor the email is configured, the form shows an error instead of
pretending it worked, and Vercel's function logs say "Signup was NOT stored".

## 3. Before you share the link
- Edit `config.js`: set `contactEmail` to an inbox you actually read (it appears on the privacy page).
- `privacy.html` says the details are processed by "our website host and a spreadsheet and email
  service". Keep that matching what you actually set up (Vercel, Google Sheets, Resend). If you skip
  the email copy, delete "and email" from that sentence.
- Collecting names, emails and phone numbers in Nigeria means the NDPC registration applies to you.

## What protects the form
- Hidden bot field and a 3-second minimum fill time (bots get a fake "success", nothing is saved).
- Server-side validation of every field, and spreadsheet formula characters neutralised.
- Per-IP limit of 5 signups an hour. This limit is held in memory per server instance, so it is a
  basic brake, not a guarantee. If you see abuse, add Cloudflare Turnstile or Vercel's firewall
  rate-limiting rules.
- Duplicate emails are not added twice; the person still sees "You're on the list".

## Run the function test locally
`node setup/test-api.js` (needs Node 18+). It mocks the sheet and email calls.
