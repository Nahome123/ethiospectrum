"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialResourceActionState } from "@/lib/resources/action-state";
import type { ResourceActionState } from "@/lib/resources/action-state";
import type { ResourceReviewStatus, ResourceStatus } from "@/lib/resources/constants";
import {
  approveResource,
  archiveResource,
  publishResource,
  rejectResource,
  restoreResource,
  submitResourceForReview,
  unpublishResource,
  withdrawResourceReview,
} from "@/lib/resources/actions";

function TransitionButton({
  action,
  expectedVersion,
  label,
}: {
  action: (state: ResourceActionState, data: FormData) => Promise<ResourceActionState>;
  expectedVersion: number;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialResourceActionState);
  return (
    <form action={formAction}>
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <Button disabled={pending} type="submit" variant="outline">
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

export function ResourceTransitionControls({
  locale,
  resourceId,
  version,
  status,
  reviewStatus,
}: {
  locale: AppLocale;
  resourceId: string;
  version: number;
  status: ResourceStatus;
  reviewStatus: ResourceReviewStatus;
}) {
  const t = useTranslations("resourceWorkflow");
  const bind = (fn: typeof submitResourceForReview) => fn.bind(null, locale, resourceId);
  return (
    <div className="flex flex-wrap gap-2" aria-label={t("workflowActions")}>
      {status === "draft" ? (
        <TransitionButton
          action={bind(submitResourceForReview)}
          expectedVersion={version}
          label={t("submit")}
        />
      ) : null}
      {status === "in_review" && reviewStatus === "in_review" ? (
        <>
          <TransitionButton
            action={bind(withdrawResourceReview)}
            expectedVersion={version}
            label={t("withdraw")}
          />
          <TransitionButton action={bind(approveResource)} expectedVersion={version} label={t("approve")} />
          <RejectControl locale={locale} resourceId={resourceId} version={version} />
        </>
      ) : null}
      {status === "in_review" && reviewStatus === "approved" ? (
        <TransitionButton action={bind(publishResource)} expectedVersion={version} label={t("publish")} />
      ) : null}
      {status === "published" ? (
        <TransitionButton action={bind(unpublishResource)} expectedVersion={version} label={t("unpublish")} />
      ) : null}
      {status !== "archived" ? (
        <TransitionButton action={bind(archiveResource)} expectedVersion={version} label={t("archive")} />
      ) : (
        <TransitionButton action={bind(restoreResource)} expectedVersion={version} label={t("restore")} />
      )}
    </div>
  );
}

function RejectControl({
  locale,
  resourceId,
  version,
}: {
  locale: AppLocale;
  resourceId: string;
  version: number;
}) {
  const t = useTranslations("resourceWorkflow");
  const [state, action, pending] = useActionState(
    rejectResource.bind(null, locale, resourceId),
    initialResourceActionState,
  );
  return (
    <form action={action} className="flex min-w-64 flex-1 flex-col gap-2">
      <input name="expectedVersion" type="hidden" value={version} />
      <Textarea
        aria-label={t("rejectionNote")}
        maxLength={1000}
        minLength={10}
        name="rejectionNote"
        placeholder={t("rejectionNote")}
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
