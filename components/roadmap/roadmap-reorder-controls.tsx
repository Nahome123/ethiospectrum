"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { reorderRoadmapItemsAction } from "@/lib/roadmap/actions";
import { initialRoadmapActionState } from "@/lib/roadmap/action-state";

export function RoadmapReorderControls({
  locale,
  itemId,
  updatedAt,
  isFirst,
  isLast,
}: {
  locale: AppLocale;
  itemId: string;
  updatedAt: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("roadmap");
  const [upState, moveUp, upPending] = useActionState(
    reorderRoadmapItemsAction.bind(null, locale, itemId, "up"),
    initialRoadmapActionState,
  );
  const [downState, moveDown, downPending] = useActionState(
    reorderRoadmapItemsAction.bind(null, locale, itemId, "down"),
    initialRoadmapActionState,
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={moveUp}>
        <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
        <Button
          aria-label={t("moveUp")}
          disabled={isFirst || upPending}
          size="icon-sm"
          type="submit"
          variant="outline"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
      </form>
      <form action={moveDown}>
        <input name="expectedUpdatedAt" type="hidden" value={updatedAt} />
        <Button
          aria-label={t("moveDown")}
          disabled={isLast || downPending}
          size="icon-sm"
          type="submit"
          variant="outline"
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </form>
      {upState.status === "error" || downState.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {upState.status === "error"
            ? upState.message
            : downState.status === "error"
              ? downState.message
              : null}
        </p>
      ) : null}
    </div>
  );
}
