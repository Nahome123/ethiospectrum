"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { cancelSupportRequestAction, closeSupportRequestAction } from "@/lib/support/actions";
import { initialSupportActionState, type SupportActionState } from "@/lib/support/action-state";

type BoundLifecycleAction = (state: SupportActionState, formData: FormData) => Promise<SupportActionState>;

function LifecycleForm({
  action,
  confirmMessage,
  label,
  pendingLabel,
  version,
}: {
  action: BoundLifecycleAction;
  confirmMessage: string;
  label: string;
  pendingLabel: string;
  version: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialSupportActionState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input name="expectedVersion" type="hidden" value={version} />
      <Button disabled={pending} type="submit" variant="outline">
        {pending ? pendingLabel : label}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="mt-2 text-sm font-semibold text-primary" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SupportRequestActions({
  locale,
  requestId,
  version,
  canClose,
  canCancel,
}: {
  locale: AppLocale;
  requestId: string;
  version: number;
  canClose: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("support");
  return (
    <div className="flex flex-wrap gap-2">
      {canClose ? (
        <LifecycleForm
          action={closeSupportRequestAction.bind(null, locale, requestId)}
          confirmMessage={t("closeConfirm")}
          label={t("close")}
          pendingLabel={t("closing")}
          version={version}
        />
      ) : null}
      {canCancel ? (
        <LifecycleForm
          action={cancelSupportRequestAction.bind(null, locale, requestId)}
          confirmMessage={t("cancelConfirm")}
          label={t("cancel")}
          pendingLabel={t("cancelling")}
          version={version}
        />
      ) : null}
    </div>
  );
}
