import { getTranslations } from "next-intl/server";
import { UploadDocumentForm } from "@/components/documents/upload-form";
import type { AppLocale } from "@/i18n/routing";
import { getUploadDependents } from "@/lib/documents/server";

export default async function UploadDocumentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations("documents");
  const { context, dependents } = await getUploadDependents();
  if (!context?.canUpload) return <p>{t("accessDenied")}</p>;

  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-bold">{t("uploadDocument")}</h1>
      <p className="mt-2 text-muted-foreground">{t("fileRequirements", { size: "20 MB" })}</p>
      <div className="mt-8 rounded-xl border bg-white p-6">
        <UploadDocumentForm dependents={dependents} locale={locale} />
      </div>
    </section>
  );
}
