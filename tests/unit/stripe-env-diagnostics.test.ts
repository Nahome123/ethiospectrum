import { describe, expect, it } from "vitest";
import { describeStripeBillingEnvProblems } from "@/lib/env/server";

const valid = {
  STRIPE_SECRET_KEY: "sk_test_51Abc",
  STRIPE_WEBHOOK_SECRET: "whsec_Abc123",
  STRIPE_RBT_MONTHLY_PRICE_ID: "price_1Abc",
};

describe("Stripe configuration diagnostics", () => {
  it("reports nothing for a valid configuration", () => {
    expect(describeStripeBillingEnvProblems(valid)).toEqual([]);
  });

  it("names missing required variables", () => {
    expect(describeStripeBillingEnvProblems({ ...valid, STRIPE_WEBHOOK_SECRET: " " })).toEqual([
      "STRIPE_WEBHOOK_SECRET is missing or empty",
    ]);
  });

  it("explains a wrong kind of identifier without revealing it", () => {
    const problems = describeStripeBillingEnvProblems({
      ...valid,
      STRIPE_SECRET_KEY: "pk_test_SECRETVALUE",
      STRIPE_RBT_MONTHLY_PRICE_ID: "prod_SECRETVALUE",
    });
    expect(problems).toEqual([
      'STRIPE_SECRET_KEY does not start with sk_test_ or sk_live_ (found prefix "pk_")',
      'STRIPE_RBT_MONTHLY_PRICE_ID does not start with price_ (found prefix "prod_")',
    ]);
    expect(problems.join(" ")).not.toContain("SECRETVALUE");
  });

  it("flags quotes or spaces pasted into a value", () => {
    expect(describeStripeBillingEnvProblems({ ...valid, STRIPE_WEBHOOK_SECRET: 'whsec_abc"' })).toEqual([
      "STRIPE_WEBHOOK_SECRET contains characters other than letters and digits (quotes, spaces, or line breaks?)",
    ]);
  });
});
