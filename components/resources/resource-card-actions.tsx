"use client";

import { useActionState } from "react";
import { Bookmark, BookmarkCheck, CircleCheck, ListPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { addResourceToRoadmapAction, updateResourceBookmarkAction } from "@/lib/resources/member-actions";
import { initialMemberResourceActionState } from "@/lib/resources/member-action-state";

export function ResourceCardActions({
  compact = false,
  initialBookmarked,
  initialOnRoadmap = false,
  locale,
  slug,
}: {
  compact?: boolean;
  initialBookmarked: boolean;
  initialOnRoadmap?: boolean;
  locale: AppLocale;
  slug: string;
}) {
  const t = useTranslations("resources");
  const [bookmarkState, bookmarkAction, bookmarkPending] = useActionState(
    updateResourceBookmarkAction.bind(null, locale, slug),
    initialMemberResourceActionState,
  );
  const [roadmapState, roadmapAction, roadmapPending] = useActionState(
    addResourceToRoadmapAction.bind(null, locale, slug),
    initialMemberResourceActionState,
  );
  const bookmarked =
    bookmarkState.status === "success" ? Boolean(bookmarkState.bookmarked) : initialBookmarked;
  const onRoadmap = roadmapState.status === "success" ? true : initialOnRoadmap;
  const BookmarkIcon = bookmarked ? BookmarkCheck : Bookmark;
  const RoadmapIcon = onRoadmap ? CircleCheck : ListPlus;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={bookmarkAction}>
          <input name="bookmarked" type="hidden" value={bookmarked ? "false" : "true"} />
          <Button
            aria-label={t(bookmarked ? "removeBookmark" : "saveBookmark")}
            disabled={bookmarkPending}
            size={compact ? "icon-sm" : "sm"}
            type="submit"
            variant="outline"
          >
            <BookmarkIcon aria-hidden="true" />
            {compact ? null : t(bookmarked ? "bookmarked" : "bookmark")}
          </Button>
        </form>
        <form action={roadmapAction}>
          <Button disabled={roadmapPending || onRoadmap} size="sm" type="submit" variant="outline">
            <RoadmapIcon aria-hidden="true" />
            {t(onRoadmap ? "onRoadmap" : "addToRoadmap")}
          </Button>
        </form>
      </div>
      {bookmarkState.status !== "idle" ? (
        <p
          className={
            bookmarkState.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
          role={bookmarkState.status === "error" ? "alert" : "status"}
        >
          {bookmarkState.message}
        </p>
      ) : null}
      {roadmapState.status !== "idle" ? (
        <p
          className={
            roadmapState.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
          role={roadmapState.status === "error" ? "alert" : "status"}
        >
          {roadmapState.message}
        </p>
      ) : null}
    </div>
  );
}
