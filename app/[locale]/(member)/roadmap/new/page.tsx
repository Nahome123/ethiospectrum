import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { RoadmapItemForm } from "@/components/roadmap/roadmap-item-form";
import { getRoadmapAssignableMembers, getRoadmapContext, getRoadmapDependents } from "@/lib/roadmap/server";

export default async function NewRoadmapItemPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "roadmap" });
  const context = await getRoadmapContext();
  if (!context || !context.canCreate) return <p role="alert">{t("accessDenied")}</p>;
  const [dependents, members] = await Promise.all([
    getRoadmapDependents(context.household.id),
    getRoadmapAssignableMembers(),
  ]);
  return (
    <section className="mx-auto max-w-3xl">
      <Link className="text-sm font-semibold underline" href="/roadmap">
        {t("backToRoadmap")}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{t("newActionItem")}</h1>
      <p className="mt-2 text-muted-foreground">{t("newDescription")}</p>
      <div className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <RoadmapItemForm
          canAssignOthers={context.permission === "owner" || context.permission === "administrator"}
          currentUserId={context.userId}
          dependents={dependents.map((dependent) => ({
            id: dependent.id,
            label: dependent.preferred_name || dependent.first_name,
          }))}
          locale={locale}
          members={members.map((member) => ({ id: member.user_id, label: member.display_name }))}
        />
      </div>
    </section>
  );
}
