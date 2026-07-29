"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { archiveRoadmapItemAction, restoreRoadmapItemAction } from "@/lib/roadmap/actions";
import { initialRoadmapActionState } from "@/lib/roadmap/action-state";

export function RoadmapItemActions({
  locale,
  itemId,
  updatedAt,
  archived,
}: {
  locale: AppLocale;
  itemId: string;
  updatedAt: string;
  archived: boolean;
}) {
  const t = useTranslations("roadmap");
  const actionFunction = archived
    ? restoreRoadmapItemAction.bind(null, locale, itemId)
    : archiveRoadmapItemAction.bind(null, locale, itemId);
  const [state, action, pending] = useActionState(actionFunction, initialRoadmapActionState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!archived && !window.confirm(t("archiveConfirm"))) event.preventDefault();
      }}
    >
      <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
      <Button disabled={pending} type="submit" variant="outline">
        {archived ? t("restore") : t("archive")}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
