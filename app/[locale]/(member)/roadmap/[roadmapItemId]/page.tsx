import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { RoadmapItemActions } from "@/components/roadmap/roadmap-item-actions";
import { RoadmapItemCard } from "@/components/roadmap/roadmap-item-card";
import { roadmapItemIdSchema } from "@/lib/validation/roadmap";
import { getRoadmapContext, getRoadmapItem } from "@/lib/roadmap/server";

export default async function RoadmapItemPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; roadmapItemId: string }> }>) {
  const { locale: localeParam, roadmapItemId } = await params;
  const locale = localeParam as AppLocale;
  if (!roadmapItemIdSchema.safeParse(roadmapItemId).success) notFound();
  const [context, item] = await Promise.all([getRoadmapContext(), getRoadmapItem(roadmapItemId)]);
  if (!context || !item) notFound();
  const [t, reminderTranslations] = await Promise.all([
    getTranslations({ locale, namespace: "roadmap" }),
    getTranslations({ locale, namespace: "reminders" }),
  ]);
  return (
    <section className="mx-auto max-w-4xl">
      <Link className="text-sm font-semibold underline" href="/roadmap">
        {t("backToRoadmap")}
      </Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t("itemDetails")}</h1>
        <div className="flex flex-wrap gap-2">
          {item.can_edit && !item.archived_at ? (
            <Link
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              href={`/roadmap/${item.id}/edit`}
            >
              {t("editActionItem")}
            </Link>
          ) : null}
          {!item.archived_at && item.due_date && !["completed", "cancelled"].includes(item.status) ? (
            <Link
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
              href={`/roadmap/${item.id}/reminders/new`}
            >
              {reminderTranslations("remindMe")}
            </Link>
          ) : null}
          {item.can_archive || item.can_restore ? (
            <RoadmapItemActions
              archived={Boolean(item.archived_at)}
              itemId={item.id}
              locale={locale}
              updatedAt={item.updated_at}
            />
          ) : null}
        </div>
      </div>
      {item.archived_at ? (
        <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm font-semibold" role="status">
          {t("archivedNotice")}
        </p>
      ) : null}
      <ul className="mt-6">
        <RoadmapItemCard count={1} index={0} item={item} locale={locale} showReorder={false} />
      </ul>
    </section>
  );
}
