"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { initialBillingActionState, type BillingActionState } from "@/lib/billing/action-state";

type ReconcileAction = (state: BillingActionState, formData: FormData) => Promise<BillingActionState>;

export function BillingReconcileForm({
  action,
  householdId,
  label,
  pendingLabel,
}: {
  action: ReconcileAction;
  householdId: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialBillingActionState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="householdId" value={householdId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <p aria-live="polite" className="min-h-5 max-w-80 text-sm text-muted-foreground">
        {state.status === "idle" ? "" : state.message}
      </p>
    </form>
  );
}
