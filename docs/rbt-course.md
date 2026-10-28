# RBT Boot Camp: one-time course ($99, one year of access)

RBT Boot Camp is no longer a monthly subscription. A household buys it once through
Stripe Checkout (mode `payment`) and gets **365 days of access from the payment date**.

## How it works

- **Price:** read from `STRIPE_RBT_COURSE_PRICE_ID` (a one-time USD Price). The amount
  is never hard-coded; the landing page, pricing and billing pages show the Stripe amount
  ("$99 one-time · 1 year of access").
- **Access record:** each purchase is a row in `training_access` (household, purchase
  date, start, `expires_at`, Checkout session, payment intent, amount, status).
  Training access (`has_training_access`, `has_household_entitlement`) requires an
  unexpired, unrefunded purchase — or a grandfathered subscription (below).
- **Renewing:** "Renew for another year" appears in the last 30 days of access and after it
  expires. A renewal bought before expiry starts when the current year ends, so no days
  are lost.
- **Webhook:** `checkout.session.completed` / `checkout.session.async_payment_succeeded`
  for a course Checkout grants access (only once the session is paid);
  `charge.refunded` with a full refund revokes that purchase. Both are idempotent, and a
  refund that arrives before the purchase event is remembered, so the late purchase
  event does not grant access. Partial refunds leave access in place.
- **Admin → Billing** lists every course purchase (active / expired / refunded).
  **Reconcile** re-applies course purchases and refunds from Stripe for that household,
  as well as legacy subscriptions.

## Existing monthly subscribers (migration)

- **Grandfathered:** a household with an _active_ RBT monthly subscription keeps training
  access exactly as before, for as long as Stripe reports the subscription active.
- **Nothing is cancelled automatically.** Stripe keeps renewing those subscriptions until
  the household cancels in the app (Billing → "Your monthly subscription" → Cancel at
  period end) or an administrator uses Admin → Billing → End membership. Once it ends,
  the household can buy the one-year course.
- **No new subscriptions are sold:** the subscription Checkout and the Customer Portal
  link are gone from the app. Keep `STRIPE_RBT_MONTHLY_PRICE_ID` set so existing
  subscriptions are still recognised and reconcile correctly.
- Consider emailing current subscribers: their plan continues, and they can switch to the
  yearly course whenever they cancel.

## Setup after deploying

1. `pnpm db:push` (migration `20261027020000_rbt_course_access`).
2. **Stripe Dashboard → Product catalog:** on the RBT Boot Camp product (or a new one),
   add a **one-time** Price of **$99.00 USD**. Copy its ID (`price_...`).
3. **Vercel → Environment Variables (Production):** set `STRIPE_RBT_COURSE_PRICE_ID` to that
   ID and redeploy. Keep `STRIPE_RBT_MONTHLY_PRICE_ID` as it is.
4. **Stripe → Developers → Webhooks →** your endpoint → add the event **`charge.refunded`**
   (keep the existing `checkout.session.*` events).
5. Test in Stripe test mode: buy the course → Billing shows "Access until …" and training
   opens; refund the payment in Stripe → access ends.
