# Stripe Integration TODO

Ethiospectrum already used Stripe Checkout, so this integration updated the two existing Checkout Session calls with the parameters configured in Checkout Studio. No new endpoints or files were added (apart from this one).

## Values to Replace

None of the Checkout Session calls contain placeholder values. Each `sample_only` parameter already had a real value, and it was kept:

**Files containing Checkout Sessions:**

- [lib/billing/actions.ts](lib/billing/actions.ts) (RBT Boot Camp subscription)
- [lib/services/payment-actions.ts](lib/services/payment-actions.ts) (Consultation and IEP Language Assistance payments)

| Field              | Current Value                                                                                                                         | What to Set                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| mode               | `subscription` (Boot Camp), `payment` (services)                                                                                      | Nothing; already matches each product type.                                                          |
| success_url        | `{site}/{locale}/billing?checkout=success` and `{site}/{locale}/requests/{id}?payment=return&session={CHECKOUT_SESSION_ID}`           | Nothing in code. Set `NEXT_PUBLIC_APP_URL` to your deployed URL (see Setup).                         |
| cancel_url         | `{site}/{locale}/billing?checkout=cancelled` and `{site}/{locale}/requests/{id}?payment=cancelled`                                    | Nothing in code. Same as above.                                                                      |
| line_items[].price | `STRIPE_RBT_MONTHLY_PRICE_ID` (env) for Boot Camp. The services use inline `price_data` built from the prices stored in the database. | Set `STRIPE_RBT_MONTHLY_PRICE_ID` to your monthly Price ID from https://dashboard.stripe.com/prices. |

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**

- [lib/billing/actions.ts](lib/billing/actions.ts)
- [lib/services/payment-actions.ts](lib/services/payment-actions.ts)

| Parameter                  | Value                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| ui_mode                    | `hosted_page` (installed `stripe` SDK is 22.4.0; versions below 21.0.0 would need `hosted`) |
| billing_address_collection | `auto`                                                                                      |
| phone_number_collection    | `{ enabled: false }`                                                                        |
| automatic_tax              | `{ enabled: false }`                                                                        |
| allow_promotion_codes      | `false`                                                                                     |
| payment_method_collection  | `always` (subscription Checkout only)                                                       |
| submit_type                | `auto`                                                                                      |
| integration_identifier     | `hosted_web_0001`                                                                           |
| origin_context             | `web`                                                                                       |

### Parameters intentionally kept

These parameters are not part of the Checkout Studio configuration. They were kept because the app needs them to link each payment to its household and request:

- `customer`
- `client_reference_id`
- `metadata`
- `subscription_data.metadata`
- `payment_intent_data.metadata`
- the idempotency key

Removing any of them would stop the webhook from recording payments.

### Behavior change: tax

`automatic_tax` is now fixed to disabled. The `STRIPE_AUTOMATIC_TAX` environment variable no longer affects Checkout, and `customer_update` (which only existed for tax) was removed. To use Stripe Tax later, change `automatic_tax` in both files (or in Checkout Studio) and restore `customer_update: { address: "auto" }`.

## Setup

### 1. Environment variables

Set these in `.env.local` for local development and in Vercel (Settings → Environment Variables) for deployments. All of them are server-only, so none need a `NEXT_PUBLIC_` prefix except the app URL. Hosted Checkout redirects to Stripe, so no publishable key is needed.

| Variable                      | Where to get it                                                                |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`           | https://dashboard.stripe.com/test/apikeys (`sk_test_...`)                      |
| `STRIPE_WEBHOOK_SECRET`       | The webhook endpoint's signing secret (`whsec_...`), see step 3                |
| `STRIPE_RBT_MONTHLY_PRICE_ID` | The RBT Boot Camp monthly recurring Price (`price_...`)                        |
| `NEXT_PUBLIC_APP_URL`         | Your site's URL, used for `success_url` and `cancel_url`                       |
| `SUPABASE_SECRET_KEY`         | Supabase → Project Settings → API Keys; the webhook uses it to record payments |

### 2. Products

1. In test mode, create a product named **RBT Boot Camp** with a **monthly recurring** price, and copy its Price ID into `STRIPE_RBT_MONTHLY_PRICE_ID`.
2. Consultation ($9.99) and IEP Language Assistance ($19.99) need no Stripe product. Their prices come from the `services` table and are managed in **Admin → Services**.

### 3. Webhook

Create an endpoint at `https://<your-site>/api/stripe/webhook` and subscribe it to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `payment_intent.payment_failed`
- `refund.updated`

If Vercel Deployment Protection is on for preview deployments, Stripe's webhooks are blocked. Add a "Protection Bypass for Automation" secret and append `?x-vercel-protection-bypass=<secret>` to the endpoint URL.

For local testing, use the Stripe CLI and put the `whsec_...` it prints into `.env.local`:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### 4. Customer portal

Activate it at https://dashboard.stripe.com/test/settings/billing/portal. Members use it to manage or cancel their Boot Camp subscription.

### 5. Database

The payment tables come from the `supabase/migrations/20260929*` migrations. Apply them with `pnpm db:push`.

## Project Structure

No new source files were created. The Stripe pieces are:

```text
lib/billing/actions.ts            Boot Camp subscription Checkout + Customer Portal
lib/billing/provider.ts           Stripe client (no pinned API version)
lib/billing/webhook.ts            Webhook event handling
lib/services/payment-actions.ts   Service payment Checkout + refunds
app/api/stripe/webhook/route.ts   Webhook endpoint
STRIPE_INTEGRATION_TODO.md        This file
```

## How It Works

**RBT Boot Camp subscription**

1. A household owner clicks Subscribe on **Billing**.
2. The server creates a subscription Checkout Session and the browser is redirected to Stripe.
3. The customer pays and Stripe returns them to `/billing?checkout=success`.
4. The webhook (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`) records the subscription, and training unlocks.

**Service payment**

1. After an admin assigns and schedules a request, the household pays from the request page.
2. A payment Checkout Session is created with the service price plus any fees.
3. The webhook marks the request paid.
4. Refunds are issued by admins from **Admin → Payments** and confirmed through `refund.updated`.

## Testing

Use test mode with any future expiry date, any CVC, and any postal code.

| Card                  | Result                            |
| --------------------- | --------------------------------- |
| `4242 4242 4242 4242` | Succeeds                          |
| `4000 0000 0000 9995` | Declined (insufficient funds)     |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |

Check delivery status under Developers → Webhooks → your endpoint → Event deliveries:

| Status | Meaning                              |
| ------ | ------------------------------------ |
| 401    | Vercel protection is blocking Stripe |
| 400    | Wrong signing secret                 |
| 500    | App error (check the Vercel logs)    |

## Next Steps

- Run the four test flows: subscribe, pay for a service, refund, and a declined card.
- Before going live:
  - switch to live keys
  - create a live Price and set its ID in `STRIPE_RBT_MONTHLY_PRICE_ID`
  - create a live webhook endpoint and use its signing secret
  - activate the live customer portal
- Decide on tax. If you need to collect sales tax, configure Stripe Tax and enable `automatic_tax` (see "Behavior change: tax" above).
- Fulfillment and order tracking already happen in the webhook and the `service_payments` and `billing_*` tables. They are visible in **Admin → Payments** and **Admin → Billing**.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
