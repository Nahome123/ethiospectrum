export const billingIntervalValues = ["month", "year"] as const;
export const billingPlanValues = ["free", "family_plus"] as const;
export const billingEntitlementValues = ["active", "inactive"] as const;
export const stripeSubscriptionStatusValues = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export const stripeBillingEventValues = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type BillingInterval = (typeof billingIntervalValues)[number];
export type BillingPlan = (typeof billingPlanValues)[number];
export type BillingEntitlementStatus = (typeof billingEntitlementValues)[number];
export type StripeSubscriptionStatus = (typeof stripeSubscriptionStatusValues)[number];
export type StripeBillingEventType = (typeof stripeBillingEventValues)[number];
export type BillingHouseholdPermission = "owner" | "administrator" | "member" | "viewer";

export function mapSubscriptionEntitlement(status: StripeSubscriptionStatus): BillingEntitlementStatus {
  return status === "active" ? "active" : "inactive";
}

export function canManageBilling(permission: BillingHouseholdPermission): boolean {
  return permission === "owner";
}

export function canViewBillingInvoices(permission: BillingHouseholdPermission): boolean {
  return permission === "owner" || permission === "administrator";
}

export function isStripeBillingEventType(value: string): value is StripeBillingEventType {
  return stripeBillingEventValues.includes(value as StripeBillingEventType);
}
