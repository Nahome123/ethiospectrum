"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { initialBillingActionState, type BillingActionState } from "@/lib/billing/action-state";

type BillingServerAction = (state: BillingActionState, formData: FormData) => Promise<BillingActionState>;

/**
 * A billing change that needs a second, deliberate click: the trigger reveals
 * a short explanation with "keep" and "confirm" buttons. Extra form fields
 * (for example a choice of when to end) go in `children`.
 */
export function ConfirmBillingAction({
  action,
  children,
  confirmLabel,
  description,
  keepLabel,
  pendingLabel,
  title,
  triggerLabel,
  triggerVariant = "outline",
}: {
  action: BillingServerAction;
  children?: React.ReactNode;
  confirmLabel: string;
  description: string;
  keepLabel: string;
  pendingLabel: string;
  title: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialBillingActionState);

  return (
    <div className="space-y-3">
      {open && state.status !== "success" ? (
        <form action={formAction} className="space-y-4 rounded-xl border border-input bg-tint p-4">
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} type="submit">
              {pending ? pendingLabel : confirmLabel}
            </Button>
            <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
              {keepLabel}
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setOpen(true)} type="button" variant={triggerVariant}>
          {triggerLabel}
        </Button>
      )}
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {state.status === "idle" ? "" : state.message}
      </p>
    </div>
  );
}
