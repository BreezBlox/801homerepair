# Square Payments Setup

## Current website payment approach

The public website includes a general `Make a payment` section and a mobile `Pay` button.

Use the public Square payment link for quick, confirmed payments such as:

- estimate fees
- deposits
- balances
- small one-off payments

Do not describe the public site button as a deposit-only flow.

## Website payment link

The public Square payment URL is configured in `SQUARE_PAYMENT_URL` at the top of `script.js`.

Example:

```js
SQUARE_PAYMENT_URL: "https://square.link/u/your-link-here"
```

Do not paste Square API keys, access tokens, or secret credentials into this static site.

## Customer guidance

Customers should only use the public payment link after the amount has been confirmed.
When possible, ask them to include the job, estimate, or invoice number in the payment note.

For structured jobs with deposit plus remaining balance, use Square Invoices and payment schedules inside Square.
