import { getTranslations } from "next-intl/server";
import { RequestDetailView } from "@/components/services/request-detail";
import { AdminRequestPanel } from "@/components/services/staff-request-panels";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getServiceRequestBundle, listMatchingSpecialists } from "@/lib/services/server";
import { uuidSchema } from "@/lib/validation/services";

export default async function AdminServiceRequestPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.detail" });
  if (!uuidSchema.safeParse(requestId).success) return <p role="alert">{t("notFound")}</p>;
  const [bundle, specialists] = await Promise.all([
    getServiceRequestBundle(requestId),
    listMatchingSpecialists(requestId),
  ]);
  if (!bundle || bundle.request.viewer_role !== "administrator") return <p role="alert">{t("notFound")}</p>;

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <Link
        className="text-sm font-semibold text-link underline underline-offset-4"
        href="/admin/service-requests"
      >
        {t("backToQueue")}
      </Link>
      <RequestDetailView
        audience="administrator"
        bundle={bundle}
        locale={locale}
        panel={<AdminRequestPanel bundle={bundle} locale={locale} specialists={specialists} />}
      />
    </section>
  );
}
