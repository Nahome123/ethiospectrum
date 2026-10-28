import { getTranslations } from "next-intl/server";
import { RequestPageGuard } from "@/components/services/request-page-guard";
import { SlotBookingForm } from "@/components/services/slot-booking-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { listBookableSpecialists, listOpenSlots } from "@/lib/services/booking";
import { formatCents } from "@/lib/services/constants";
import { topicLabel } from "@/lib/services/display";
import { getService, listConsultationTopics, listDependentOptions } from "@/lib/services/server";

/** Consultation: choose a specialist (or either), pick an open time, then pay. */
export default async function ConsultationBookingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.form" });
  const booking = await getTranslations({ locale, namespace: "services.booking" });
  const access = await getHouseholdAccess();
  const [service, dependents, topics, specialists] = await Promise.all([
    getService("consultation"),
    access ? listDependentOptions(access.household.id) : Promise.resolve([]),
    listConsultationTopics(),
    listBookableSpecialists("consultation"),
  ]);
  const languages = specialists.flatMap((item) => item.languages);
  const language = languages.includes(locale) ? locale : (languages[0] ?? "en");
  const initialSlots =
    specialists.length > 0
      ? await listOpenSlots("consultation", language, specialists.length === 1 ? specialists[0].id : null)
      : [];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-link underline underline-offset-4" href="/services">
        {t("backToServices")}
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{t("consultationTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {booking("consultationSummary", {
            price: formatCents(service?.price_cents ?? 4999, locale),
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
      ) : specialists.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground" role="status">
          {booking("noSpecialists")}
        </p>
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <SlotBookingForm
            dependents={dependents}
            initialSlots={initialSlots}
            locale={locale}
            serviceType="consultation"
            specialists={specialists}
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
