import { getTranslations } from "next-intl/server";
import { DependentForm } from "@/components/dependents/dependent-form";
import type { AppLocale } from "@/i18n/routing";
import { getActiveDependent } from "@/lib/dependents/server";
export default async function Page({ params }: { params: Promise<{ locale: string; dependentId: string }> }) {
  const { locale, dependentId } = await params;
  const t = await getTranslations("dependents");
  const record = await getActiveDependent(dependentId);
  if (!record?.context.canManage) return <p>{t("notFound")}</p>;
  const d = record.dependent;
  return (
    <section className="max-w-xl">
      <h1 className="text-3xl font-bold">{t("edit")}</h1>
      <div className="mt-8 rounded-xl border bg-white p-6">
        <DependentForm
          locale={locale as AppLocale}
          dependentId={dependentId}
          initial={{
            firstName: d.first_name,
            lastName: d.last_name ?? "",
            preferredName: d.preferred_name ?? "",
            birthYear: d.birth_year?.toString() ?? "",
            schoolDistrict: d.school_district ?? "",
            gradeLevel: d.grade_level ?? "",
            notes: d.notes ?? "",
          }}
        />
      </div>
    </section>
  );
}
