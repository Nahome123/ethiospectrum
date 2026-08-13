"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { initialBillingActionState, type BillingActionState } from "@/lib/billing/action-state";

type BillingServerAction = (state: BillingActionState, formData: FormData) => Promise<BillingActionState>;

export function BillingActionForm({
  action,
  label,
  pendingLabel,
  billingInterval,
  variant = "default",
}: {
  action: BillingServerAction;
  label: string;
  pendingLabel: string;
  billingInterval?: "month" | "year";
  variant?: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, initialBillingActionState);

  useEffect(() => {
    if (state.status === "success" && state.url) window.location.assign(state.url);
  }, [state]);

  return (
    <form action={formAction} className="space-y-2">
      {billingInterval ? <input type="hidden" name="billingInterval" value={billingInterval} /> : null}
      <Button type="submit" size="lg" variant={variant} disabled={pending} className="min-h-11">
        {pending ? pendingLabel : label}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {state.status === "idle" ? "" : state.message}
      </p>
    </form>
  );
}
