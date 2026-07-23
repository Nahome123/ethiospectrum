import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArchiveDependentButton } from "@/components/dependents/archive-dependent-button";
import type { AppLocale } from "@/i18n/routing";
import { getActiveDependent } from "@/lib/dependents/server";
export default async function Page({ params }: { params: Promise<{ locale: string; dependentId: string }> }) {
  const { locale, dependentId } = await params;
  const t = await getTranslations("dependents");
  const record = await getActiveDependent(dependentId);
  if (!record) return <p>{t("notFound")}</p>;
  const { dependent, context } = record;
  return (
    <section className="max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{dependent.preferred_name || dependent.first_name}</h1>
        {context.canManage && (
          <div className="flex gap-3">
            <Link href={`/dependents/${dependent.id}/edit`}>{t("edit")}</Link>
            <ArchiveDependentButton locale={locale as AppLocale} dependentId={dependent.id} />
          </div>
        )}
      </div>
      <dl className="mt-8 space-y-3 rounded-xl border bg-white p-6">
        {[
          [t("firstName"), dependent.first_name],
          [t("lastName"), dependent.last_name],
          [t("preferredName"), dependent.preferred_name],
          [t("birthYear"), dependent.birth_year],
          [t("schoolDistrict"), dependent.school_district],
          [t("gradeLevel"), dependent.grade_level],
          [t("notes"), dependent.notes],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={String(label)}>
              <dt className="font-semibold">{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
