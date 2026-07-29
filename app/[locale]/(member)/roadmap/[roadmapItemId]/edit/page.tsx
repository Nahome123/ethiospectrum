import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { RoadmapItemForm } from "@/components/roadmap/roadmap-item-form";
import type { RoadmapCategory, RoadmapPriority, RoadmapStatus } from "@/lib/roadmap/constants";
import { roadmapItemIdSchema } from "@/lib/validation/roadmap";
import {
  getRoadmapAssignableMembers,
  getRoadmapContext,
  getRoadmapDependents,
  getRoadmapItem,
} from "@/lib/roadmap/server";

export default async function EditRoadmapItemPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; roadmapItemId: string }> }>) {
  const { locale: localeParam, roadmapItemId } = await params;
  const locale = localeParam as AppLocale;
  if (!roadmapItemIdSchema.safeParse(roadmapItemId).success) notFound();
  const [context, item] = await Promise.all([getRoadmapContext(), getRoadmapItem(roadmapItemId)]);
  if (!context || !item || !item.can_edit || item.archived_at) notFound();
  const [dependents, members] = await Promise.all([
    getRoadmapDependents(context.household.id),
    getRoadmapAssignableMembers(),
  ]);
  const t = await getTranslations({ locale, namespace: "roadmap" });
  return (
    <section className="mx-auto max-w-3xl">
      <Link className="text-sm font-semibold underline" href={`/roadmap/${item.id}`}>
        {t("backToItem")}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{t("editActionItem")}</h1>
      <div className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <RoadmapItemForm
          canAssignOthers={context.permission === "owner" || context.permission === "administrator"}
          currentUserId={context.userId}
          dependents={dependents.map((dependent) => ({
            id: dependent.id,
            label: dependent.preferred_name || dependent.first_name,
          }))}
          initial={{
            title: item.title,
            description: item.description ?? "",
            category: item.category as RoadmapCategory,
            priority: item.priority as RoadmapPriority,
            status: item.status as RoadmapStatus,
            dueDate: item.due_date ?? "",
            dependentId: item.dependent_id ?? "",
            assignedTo: item.assigned_to ?? "",
            expectedUpdatedAt: item.updated_at,
            historicalDependentLabel: item.dependent_name ?? t("archivedDependent"),
            historicalAssigneeLabel: item.assignee_name ?? t("formerHouseholdMember"),
          }}
          itemId={item.id}
          locale={locale}
          members={members.map((member) => ({ id: member.user_id, label: member.display_name }))}
        />
      </div>
    </section>
  );
}
