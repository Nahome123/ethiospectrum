import { CalendarDays, CheckCircle2, CircleAlert, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { isRoadmapOverdue } from "@/lib/validation/roadmap";
import type { RoadmapItem } from "@/lib/roadmap/server";
import { RoadmapReorderControls } from "./roadmap-reorder-controls";

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}

export async function RoadmapItemCard({
  item,
  locale,
  index,
  count,
  showReorder,
}: {
  item: RoadmapItem;
  locale: AppLocale;
  index: number;
  count: number;
  showReorder: boolean;
}) {
  const t = await getTranslations("roadmap");
  const overdue = isRoadmapOverdue(
    {
      dueDate: item.due_date,
      status: item.status as "not_started" | "in_progress" | "blocked" | "completed" | "cancelled",
      archivedAt: item.archived_at,
    },
    new Date().toISOString().slice(0, 10),
  );
  return (
    <li className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link className="block break-words text-lg font-bold hover:underline" href={`/roadmap/${item.id}`}>
            {item.title}
          </Link>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{t(`statuses.${item.status}`)}</Badge>
            <Badge variant="outline">{t(`priorities.${item.priority}`)}</Badge>
            <Badge variant="outline">{t(`categories.${item.category}`)}</Badge>
            {overdue ? (
              <Badge variant="destructive">
                <CircleAlert aria-hidden="true" />
                {t("overdue")}
              </Badge>
            ) : null}
          </div>
        </div>
        {showReorder && item.can_reorder ? (
          <RoadmapReorderControls
            isFirst={index === 0}
            isLast={index === count - 1}
            itemId={item.id}
            locale={locale}
            updatedAt={item.updated_at}
          />
        ) : null}
      </div>
      {item.description ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{item.description}</p>
      ) : null}
      <dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        {item.due_date ? (
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-4" />
            <dt className="sr-only">{t("dueDate")}</dt>
            <dd>{formatDate(item.due_date, locale)}</dd>
          </div>
        ) : null}
        {item.dependent_id ? (
          <div>
            <dt className="sr-only">{t("dependent")}</dt>
            <dd>{item.dependent_name ?? t("archivedDependent")}</dd>
          </div>
        ) : null}
        {item.assigned_to ? (
          <div className="flex items-center gap-2">
            <UserRound aria-hidden="true" className="size-4" />
            <dt className="sr-only">{t("assignee")}</dt>
            <dd>
              {item.assignee_name ??
                (item.assignee_is_former ? t("formerHouseholdMember") : t("assignedHouseholdMember"))}
            </dd>
          </div>
        ) : null}
        {item.completed_at ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            <dt className="sr-only">{t("completed")}</dt>
            <dd>{formatDate(item.completed_at.slice(0, 10), locale)}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}
