import { getTranslations } from "next-intl/server";
import { RequestDetailView } from "@/components/services/request-detail";
import { SpecialistRequestPanel } from "@/components/services/staff-request-panels";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getServiceRequestBundle } from "@/lib/services/server";
import { uuidSchema } from "@/lib/validation/services";

export default async function SpecialistRequestPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.detail" });
  const bundle = uuidSchema.safeParse(requestId).success ? await getServiceRequestBundle(requestId) : null;
  // One safe state for missing, unassigned, or reassigned requests.
  if (!bundle || bundle.request.viewer_role !== "specialist") {
    return (
      <section className="mx-auto max-w-3xl">
        <p role="alert">{t("notFound")}</p>
        <Link className="mt-3 inline-block text-sm font-semibold underline" href="/specialist">
          {t("backToAssignments")}
        </Link>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <Link className="text-sm font-semibold text-link underline underline-offset-4" href="/specialist">
        {t("backToAssignments")}
      </Link>
      <RequestDetailView
        audience="specialist"
        bundle={bundle}
        locale={locale}
        panel={<SpecialistRequestPanel bundle={bundle} locale={locale} />}
      />
    </section>
  );
}
