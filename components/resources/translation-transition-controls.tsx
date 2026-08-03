"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialResourceActionState, type ResourceActionState } from "@/lib/resources/action-state";
import {
  approveResourceTranslation,
  rejectResourceTranslation,
  submitResourceTranslation,
  withdrawResourceTranslation,
} from "@/lib/resources/translation-actions";

type TranslationLocale = "am" | "es";
type Action = (state: ResourceActionState, formData: FormData) => Promise<ResourceActionState>;
function Control({
  action,
  id,
  version,
  label,
  destructive = false,
}: {
  action: Action;
  id: string;
  version: number;
  label: string;
  destructive?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialResourceActionState);
  return (
    <form action={formAction}>
      <input name="translationId" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      <Button disabled={pending} type="submit" variant={destructive ? "destructive" : "outline"}>
        {pending ? "…" : label}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
export function TranslationTransitionControls({
  locale,
  resourceId,
  translationLocale,
  translationId,
  version,
  status,
  stale,
  ownSubmission,
}: {
  locale: AppLocale;
  resourceId: string;
  translationLocale: TranslationLocale;
  translationId: string;
  version: number;
  status: "draft" | "in_review" | "approved";
  stale: boolean;
  ownSubmission: boolean;
}) {
  const t = useTranslations("resourceWorkflow");
  const bind = (action: typeof submitResourceTranslation) =>
    action.bind(null, locale, resourceId, translationLocale);
  return (
    <div className="flex flex-wrap gap-2" aria-label={t("workflowActions")}>
      {status === "draft" ? (
        <Control
          action={bind(submitResourceTranslation)}
          id={translationId}
          version={version}
          label={t("submitTranslation")}
        />
      ) : null}
      {status === "in_review" ? (
        <>
          <Control
            action={bind(withdrawResourceTranslation)}
            id={translationId}
            version={version}
            label={t("withdraw")}
          />
          {!stale && !ownSubmission ? (
            <Control
              action={bind(approveResourceTranslation)}
              id={translationId}
              version={version}
              label={t("approve")}
            />
          ) : null}
          {ownSubmission ? (
            <p className="text-sm text-muted-foreground">{t("cannotReviewOwnTranslation")}</p>
          ) : null}
          {!stale && !ownSubmission ? (
            <RejectControl
              locale={locale}
              resourceId={resourceId}
              translationLocale={translationLocale}
              id={translationId}
              version={version}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function RejectControl({
  locale,
  resourceId,
  translationLocale,
  id,
  version,
}: {
  locale: AppLocale;
  resourceId: string;
  translationLocale: TranslationLocale;
  id: string;
  version: number;
}) {
  const t = useTranslations("resourceWorkflow");
  const [state, formAction, pending] = useActionState(
    rejectResourceTranslation.bind(null, locale, resourceId, translationLocale),
    initialResourceActionState,
  );
  return (
    <form action={formAction} className="flex min-w-64 flex-col gap-2">
      <input name="translationId" type="hidden" value={id} />
      <input name="expectedVersion" type="hidden" value={version} />
      <Textarea
        aria-label={t("rejectionNote")}
        maxLength={1000}
        minLength={10}
        name="rejectionNote"
        required
        rows={2}
      />
      <Button disabled={pending} type="submit" variant="destructive">
        {pending ? "…" : t("reject")}
      </Button>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
