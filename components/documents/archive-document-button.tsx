"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { archiveDocumentAction } from "@/lib/documents/actions";
import { initialDocumentActionState } from "@/lib/documents/action-state";

export function ArchiveDocumentButton({ locale, documentId }: { locale: AppLocale; documentId: string }) {
  const t = useTranslations("documents");
  const [state, action, pending] = useActionState(
    archiveDocumentAction.bind(null, locale, documentId),
    initialDocumentActionState,
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t("archiveConfirm"))) event.preventDefault();
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
