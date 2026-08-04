import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SupportRequestForm } from "@/components/support/support-request-form";
import { getSupportContext } from "@/lib/support/server";

export default async function NewSupportRequestPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "support" });
  const context = await getSupportContext();
  if (!context || !context.canCreate) {
    return (
      <section className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold underline" href="/support">
          {t("backToSupport")}
        </Link>
        <h1 className="mt-4 text-3xl font-bold">{t("newRequest")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {context ? t("readOnlyDescription") : t("accessDenied")}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/support">
          {t("backToSupport")}
        </Link>
        <h1 className="mt-4 text-3xl font-bold">{t("newRequest")}</h1>
        <p className="mt-2 text-muted-foreground">{t("newDescription")}</p>
      </div>
      <SupportRequestForm locale={locale} />
    </section>
  );
}
