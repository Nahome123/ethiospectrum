import { getTranslations } from "next-intl/server";
import { ConsultationRequestForm } from "@/components/services/consultation-request-form";
import { RequestPageGuard } from "@/components/services/request-page-guard";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatCents } from "@/lib/services/constants";
import { topicLabel } from "@/lib/services/display";
import { getService, listConsultationTopics, listDependentOptions } from "@/lib/services/server";

export default async function ConsultationRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.form" });
  const access = await getHouseholdAccess();
  const [service, dependents, topics] = await Promise.all([
    getService("consultation"),
    access ? listDependentOptions(access.household.id) : Promise.resolve([]),
    listConsultationTopics(),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/services">
        {t("backToServices")}
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{t("consultationTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("consultationSummary", {
            price: formatCents(service?.price_cents ?? 999, locale),
            minutes: service?.duration_minutes ?? 60,
          })}
        </p>
        <p className="mt-2 text-sm font-semibold">{t("noSubscriptionNeeded")}</p>
      </div>
      {!access ? (
        <RequestPageGuard reason="household" />
      ) : !access.permissions.includes("submit_requests") ? (
        <RequestPageGuard reason="permission" />
      ) : dependents.length === 0 ? (
        <RequestPageGuard reason="dependents" />
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <ConsultationRequestForm
            dependents={dependents}
            locale={locale}
            topics={topics.map((topic) => ({
              key: topic.topic_key,
              category: topic.category,
              label: topicLabel(topic.labels, locale),
            }))}
          />
        </div>
      )}
    </section>
  );
}
