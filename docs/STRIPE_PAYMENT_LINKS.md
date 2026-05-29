# Stripe Payment Links Workflow

## Current payment approach

The public website does not include a generic payment or deposit button.

For each approved job, create and send a customer-specific Stripe Payment Link outside the site.

## Per-job deposit workflow

1. Create the estimate in the normal estimate workflow.
2. Assign or confirm the job or estimate number.
3. In Stripe, create a Payment Link for the exact deposit amount.
4. Use a clear title such as `Deposit - Job #1042`.
5. Enable Stripe's option to save payment details for future use.
6. Send that private link directly to the customer.
7. After the job is complete, manually charge the remaining approved balance from the Stripe Dashboard.

## Notes

- Do not use a generic public deposit link on the website.
- Do not ask customers to type their own deposit amount unless there is a specific reason.
- Include the job or estimate number in the Stripe link title or description.
- Only charge the remaining approved balance. Get written approval before charging added scope, added materials, or other changes.
- A saved payment method can still fail or require follow-up authentication. If that happens, send the customer a normal balance payment link.
