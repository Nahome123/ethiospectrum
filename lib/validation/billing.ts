import { z } from "zod";
import { billingIntervalValues } from "@/lib/billing/constants";

export const billingIntervalSchema = z.enum(billingIntervalValues);
export const billingHouseholdIdSchema = z.uuid();

export const billingCheckoutSchema = z.object({
  billingInterval: billingIntervalSchema,
});

export const billingReconciliationSchema = z.object({
  householdId: billingHouseholdIdSchema,
});
