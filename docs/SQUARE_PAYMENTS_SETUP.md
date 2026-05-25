# Square Payments Setup

## Recommended workflow

Use Square Invoices as the source of truth for each job:

1. Create the written estimate or invoice in Square.
2. Add the agreed deposit amount or deposit percentage.
3. Send the Square invoice link by text or email.
4. Collect the deposit before scheduling or buying materials when that is required.
5. Add approved extra materials or change-order items before closing the invoice.
6. Collect the remaining balance when the work is complete.

This keeps the deposit, remaining balance, customer info, and payment history attached to the same job.

## Website payment button

The landing page now has a `Pay a job deposit` section and a mobile `Pay` button.
Until `SQUARE_PAYMENT_URL` is filled in, the section falls back to a text-message payment-link request and the mobile `Pay` button stays hidden.

To turn it on:

1. In Square, create a Payment Link or Checkout Link for job deposits.
2. Use a setup that lets the customer enter the deposit amount.
3. Require or request customer name, phone/email, and a note for the estimate or invoice number if Square allows it.
4. Copy the Square payment URL.
5. Paste it into `SQUARE_PAYMENT_URL` at the top of `script.js`.

Example:

```js
SQUARE_PAYMENT_URL: "https://square.link/u/your-link-here"
```

Do not paste Square API keys, access tokens, or secret credentials into this static site.

## Important limitation

A generic website payment link is cheap and simple, but it is not the same as a customer-specific Square invoice link.

For the cleanest bookkeeping, send the actual Square invoice link for each job. Use the website button as a fallback deposit intake option when you want customers to pay from the landing page.

If a customer pays through a generic Square payment link, confirm the estimate or invoice number and make sure the payment is matched to the right job in Square before treating the invoice as settled.
