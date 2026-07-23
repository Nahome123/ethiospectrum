"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { archiveDependentAction } from "@/lib/dependents/actions";
import { initialDependentActionState } from "@/lib/dependents/action-state";

export function ArchiveDependentButton({ locale, dependentId }: { locale: AppLocale; dependentId: string }) {
  const t = useTranslations("dependents");
  const [state, action, pending] = useActionState(
    archiveDependentAction.bind(null, locale, dependentId),
    initialDependentActionState,
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t("archiveConfirm"))) {
          event.preventDefault();
        }
      }}
    >
      <Button disabled={pending} type="submit" variant="outline">
        {t("archive")}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
