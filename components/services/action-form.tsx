"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; url?: string; inviteUrl?: string };

type ActionFormProps = {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel: string;
  /** Asks for confirmation before submitting a consequential change. */
  confirmMessage?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Navigates to a provider-hosted page (Stripe Checkout/Portal) returned by the action. */
  followUrl?: boolean;
  resetOnSuccess?: boolean;
  inline?: boolean;
};

/**
 * Thin client wrapper around a Server Action: pending state, optional
 * confirmation, and an accessible result message. Authorization and
 * validation happen on the server; this component holds no permission logic.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  confirmMessage,
  variant = "default",
  size = "default",
  className,
  followUrl = false,
  resetOnSuccess = false,
  inline = false,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ActionFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success") return;
    if (followUrl && state.url) window.location.assign(state.url);
    if (resetOnSuccess) formRef.current?.reset();
  }, [state, followUrl, resetOnSuccess]);

  return (
    <form
      action={formAction}
      className={cn(inline ? "inline-flex flex-wrap items-center gap-2" : "space-y-4", className)}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      ref={formRef}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size={size} type="submit" variant={variant}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <p aria-live="polite" className="sr-only">
          {pending ? pendingLabel : ""}
        </p>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <div className="space-y-2" role="status">
          <p className="text-sm font-medium text-emerald-700">{state.message}</p>
          {state.inviteUrl ? (
            <input
              aria-label={state.message}
              className="w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={state.inviteUrl}
            />
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
