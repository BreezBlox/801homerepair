# Stripe Netlify Option A

## What this is

This is the first payment workflow for approved estimates:

1. Create the estimate/PDF in the existing estimate tool.
2. Send the estimate to the customer.
3. After approval, use `/admin/payments.html` to create a Stripe deposit checkout link.
4. Customer pays the deposit through Stripe Checkout.
5. Stripe saves the payment method for off-session use.
6. After job completion, use `/admin/payments.html` to charge the final approved balance.

The estimate/PDF stays the source of truth. Stripe is only the payment rail.

## Files added

- `admin/payments.html` - private internal tool for creating deposit links and charging final balances
- `payment-status.html` - customer-facing success/cancel landing page after Stripe Checkout
- `netlify/functions/create-deposit-session.mjs` - creates the deposit Checkout Session
- `netlify/functions/charge-final-balance.mjs` - charges the saved payment method for the final balance
- `package.json` / `package-lock.json` - Stripe dependency for Netlify Functions

## Required Netlify environment variables

Set these in Netlify before using the tool:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key, starting with `sk_test_` for testing or `sk_live_` for live use |
| `PAYMENT_ADMIN_TOKEN` | Private token required by the admin functions |
| `SITE_URL` | Production site URL, such as `https://www.homerepairslc.com` |

Do not put Stripe secret keys in `script.js`, `index.html`, or `netlify.toml`.

## Generate an admin token

PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($bytes)
-join ($bytes | ForEach-Object { $_.ToString("x2") })
$rng.Dispose()
```

Copy the generated value into Netlify as `PAYMENT_ADMIN_TOKEN`.

## Customer authorization language

The estimate/payment terms should include this before the customer pays the deposit:

```text
Deposit is due before scheduling. By paying the deposit, customer authorizes 801 Home Repair to securely save the payment method with Stripe and charge the remaining approved balance upon job completion. Any change orders or added work must be approved before being included in the final charge. A receipt will be sent after each payment.
```

The admin tool requires a checkbox confirming this language is already in the estimate/payment terms.

## Stripe setup notes

In Stripe:

1. Use test mode first.
2. Enable card payments and wallet payment methods you want to accept.
3. Use Stripe Checkout for the deposit link.
4. The deposit function sets `setup_future_usage` to `off_session`, which tells Stripe the method is intended for future off-session charges.
5. After a successful deposit, the final-balance function retrieves the paid Checkout Session and charges the saved method.

The final charge can still fail if the card declines, the bank requires re-authorization, the wallet authorization is no longer valid, or the customer disputes the charge. If Stripe returns that customer action is required, send the customer a new payment link for the balance.

## Local testing

Install dependencies:

```powershell
npm install
```

Run a syntax check:

```powershell
npm run check:functions
```

Run locally with Netlify:

```powershell
npm run dev
```

Open:

```text
http://localhost:8888/admin/payments.html
```

For local testing, put test values in a local `.env` file or use Netlify's local env tooling. Do not commit local env files.

## Workflow discipline

- Create the PDF estimate first.
- Confirm the estimate includes saved-payment authorization language.
- Create the Stripe deposit link only after the amount is approved.
- Keep the returned Checkout Session ID with the estimate/job record.
- Charge the final balance only after completion and only for the approved balance.
- If the final charge fails, do not keep retrying blindly. Send a fresh balance link or contact the customer.
