# 801 Home Repair Landing Page

Production-ready static landing page for **801 Home Repair** with:
- No build step
- Mobile-first responsive design
- Netlify Forms support
- Google Calendar Appointment Schedule booking link
- Local SEO metadata and schema
- Sticky mobile call/text/book CTA
- Shareable digital business card with 1-2 tap actions

## File Structure

- `index.html` main landing page
- `styles.css` site styles and responsive layout
- `script.js` business placeholders + light UI behavior
- `docs/BOOKING_SETUP.md` Google Appointment Schedule setup notes
- `docs/STRIPE_PAYMENT_LINKS.md` private per-job Stripe Payment Links workflow
- `card/index.html` production digital card page (`/card/`)
- `card/card.css` digital card styles
- `card/card.js` tracked link handling for card page
- `801-home-repair.vcf` downloadable contact card
- `thank-you.html` post-submit confirmation page
- `robots.txt` crawler rules
- `sitemap.xml` XML sitemap
- `netlify.toml` Netlify deploy + headers + redirects

## Edit Your Business Details

Update placeholders at the top of `script.js`:

- `BUSINESS_NAME`
- `SECONDARY_NAME`
- `OWNER_NAME`
- `PHONE`
- `SMS`
- `EMAIL`
- `SERVICE_AREAS`
- `LICENSED_INSURED_TOGGLE`
- `PRIMARY_ACCENT`
- `SECONDARY_ACCENT`
- `SITE_URL`
- `BOOKING_URL`

`LICENSED_INSURED_TOGGLE` defaults to `false`.  
Set to `true` only when you want licensed/insured language displayed.

## Netlify Form Setup

The quote form is already configured for Netlify Forms:
- form name: `quote-request`
- method: `POST`
- `data-netlify="true"`
- honeypot: `netlify-honeypot="bot-field"`
- success redirect: `/thank-you.html`
- includes hidden source field: `source`

After first deploy, submit one test form on production so Netlify detects the form.

## Booking Setup

The landing page links to a Google Calendar Appointment Schedule.

Read:
- `docs/BOOKING_SETUP.md`

High-level flow:
- customer clicks `Book a time`
- Google Calendar opens the appointment schedule
- Google handles available times and calendar booking

## Stripe Payment Links Workflow

Read:
- `docs/STRIPE_PAYMENT_LINKS.md`

High-level flow:
- keep payment links off the public website
- create a customer-specific Stripe Payment Link for the exact job deposit
- include the job or estimate number in the Stripe link title or description
- enable saved payment details for future use if the remaining balance will be charged later from Stripe Dashboard

## Digital Card + Tracked Links

Live card path:
- `/card/`

Recommended text share links:
- Homeowner: `https://yourdomain.com/card/?src=text-homeowner`
- Landlord: `https://yourdomain.com/card/?src=text-landlord`
- QR code: `https://yourdomain.com/card/?src=qr`

Tracking behavior:
- `src` is stored and forwarded into the quote form hidden field (`source`)
- quote requests from card links land in Netlify submissions with source attribution
- `Save Contact` points to `/801-home-repair.vcf`

## Deploy (Zero Build Step)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify, choose **Add new site** -> **Import an existing project**.
3. Select the repo.
4. Build settings:
   - Build command: *(leave blank)*
   - Publish directory: `.`
5. Deploy.

Or drag/drop the project folder to Netlify Drop for quick hosting.

## Important SEO Placeholders To Update

Replace `https://example.com` with your real domain in:
- `script.js` (`SITE_URL`)
- `index.html` canonical + OG/Twitter tags
- `card/index.html` canonical + OG/Twitter tags
- `801-home-repair.vcf` URL field
- `robots.txt`
- `sitemap.xml`

Also replace social profile placeholders in the JSON-LD `sameAs` list in `index.html`.

## Local Preview

Use any static server. Example with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Codex Context Setup

This repo includes both repo-level and installable global Codex context for contractor work.

Repo-scoped context:
- `AGENTS.md`
- `docs/`

Global installable context:
- `codex/global/AGENTS.md`

To install the global Codex context on a Windows machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-codex-global-context.ps1
```

That command copies the repo-tracked global context into:
- `%USERPROFILE%\.codex\AGENTS.md`

If a global `AGENTS.md` already exists, the script creates a timestamped backup first.

## Estimate Builder On GitHub Pages

This repo now also includes a phone-friendly estimate builder at:
- `estimate-builder/`

If you publish this repo with GitHub Pages from the repository root, the builder will be available at:
- `https://<your-github-username>.github.io/<your-repo-name>/estimate-builder/`

Recommended free workflow:
- use the hosted builder on desktop or phone
- use `Export Editable Draft (.json)` to move an estimate through Google Drive
- use `Open Editable Draft (.json)` on the other device to continue editing
- use `Print / Save PDF` only for the final shareable copy

GitHub Pages setup:
1. Push the repo to GitHub.
2. Open the repo on GitHub.
3. Go to `Settings` -> `Pages`.
4. Set `Source` to `Deploy from a branch`.
5. Select your main branch and the `/ (root)` folder.
6. Save, then wait for GitHub Pages to publish.
