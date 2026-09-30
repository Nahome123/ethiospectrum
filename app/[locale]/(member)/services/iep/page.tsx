import { getTranslations } from "next-intl/server";
import { IepRequestForm } from "@/components/services/iep-request-form";
import { RequestPageGuard } from "@/components/services/request-page-guard";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatCents } from "@/lib/services/constants";
import { getService, listDependentOptions } from "@/lib/services/server";

export default async function IepRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.form" });
  const access = await getHouseholdAccess();
  const [service, dependents] = await Promise.all([
    getService("iep_language_assistance"),
    access ? listDependentOptions(access.household.id) : Promise.resolve([]),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/services">
        {t("backToServices")}
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{t("iepTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("iepSummary", {
            price: formatCents(service?.price_cents ?? 1999, locale),
            minutes: service?.duration_minutes ?? 60,
          })}
        </p>
        <p className="mt-2 text-sm font-semibold">{t("noSubscriptionNeeded")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("preparationNotice")}</p>
      </div>
      {!access ? (
        <RequestPageGuard reason="household" />
      ) : !access.permissions.includes("submit_requests") ? (
        <RequestPageGuard reason="permission" />
      ) : dependents.length === 0 ? (
        <RequestPageGuard reason="dependents" />
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <IepRequestForm dependents={dependents} locale={locale} />
        </div>
      )}
    </section>
  );
}
