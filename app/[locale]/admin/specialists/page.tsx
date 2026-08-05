import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { listAssignableSpecialists } from "@/lib/specialists/server";

export const dynamic = "force-dynamic";

export default async function AdminSpecialistsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "specialists" });
  const specialists = await listAssignableSpecialists();

  if (specialists === null) {
    return (
      <section className="max-w-5xl">
        <h1 className="text-3xl font-bold">{t("directoryTitle")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("loadError")}
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("directoryTitle")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{t("directoryDescription")}</p>
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("directoryNotice")}
      </p>
      {specialists.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{t("noSpecialists")}</h2>
        </div>
      ) : (
        <ul aria-label={t("directoryTitle")} className="grid gap-3">
          {specialists.map((specialist) => (
            <li className="rounded-2xl border border-border bg-white p-5" key={specialist.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-bold [overflow-wrap:anywhere]">
                  {specialist.display_name}
                </h2>
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                  {specialist.is_eligible ? t("eligible") : t("notEligible")}
                </span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="flex flex-wrap gap-1.5">
                  <dt className="font-semibold">{t("availability")}:</dt>
                  <dd>{t(`availabilityStatuses.${specialist.availability_status}`)}</dd>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <dt className="font-semibold">{t("activeAssignmentsLabel")}:</dt>
                  <dd>{t("activeAssignments", { count: specialist.active_assignment_count })}</dd>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <dt className="font-semibold">{t("languages")}:</dt>
                  <dd className="break-words [overflow-wrap:anywhere]">
                    {specialist.languages.length > 0 ? specialist.languages.join(", ") : t("none")}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <dt className="font-semibold">{t("specialties")}:</dt>
                  <dd className="break-words [overflow-wrap:anywhere]">
                    {specialist.specialties.length > 0 ? specialist.specialties.join(", ") : t("none")}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
