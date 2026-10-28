import { getTranslations } from "next-intl/server";
import { RequestPageGuard } from "@/components/services/request-page-guard";
import { SlotBookingForm } from "@/components/services/slot-booking-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { listBookableSpecialists, listOpenSlots } from "@/lib/services/booking";
import { getService, listDependentOptions } from "@/lib/services/server";
import { uuidSchema } from "@/lib/validation/services";

/** Parent Support: a free session, booked straight into an open time. */
export default async function ParentSupportBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.form" });
  const booking = await getTranslations({ locale, namespace: "services.booking" });
  const [service, specialists, access] = await Promise.all([
    getService("parent_support"),
    listBookableSpecialists("parent_support"),
    getHouseholdAccess(),
  ]);
  const dependents = access ? await listDependentOptions(access.household.id) : [];
  const requestedSpecialist = uuidSchema.safeParse(search.specialist);
  const requestedStart = typeof search.start === "string" ? search.start : null;
  const initialChoice =
    requestedSpecialist.success &&
    requestedStart &&
    specialists.some((item) => item.id === requestedSpecialist.data)
      ? { specialistId: requestedSpecialist.data, startAt: requestedStart }
      : null;
  const languages = specialists.flatMap((item) => item.languages);
  const language = languages.includes(locale) ? locale : (languages[0] ?? "en");
  const initialSlots =
    specialists.length > 0
      ? await listOpenSlots(
          "parent_support",
          initialChoice ? null : language,
          initialChoice?.specialistId ?? (specialists.length === 1 ? specialists[0].id : null),
        )
      : [];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-link underline underline-offset-4" href="/services">
        {t("backToServices")}
      </Link>
      <div>
        <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
          {booking("free")}
        </p>
        <h1 className="mt-3 text-3xl font-bold">{booking("parentSupportTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {booking("parentSupportSummary", { minutes: service?.duration_minutes ?? 30 })}
        </p>
      </div>
      {!access ? (
        <RequestPageGuard reason="household" />
      ) : !access.permissions.includes("submit_requests") ? (
        <RequestPageGuard reason="permission" />
      ) : dependents.length === 0 ? (
        <RequestPageGuard reason="dependents" />
      ) : specialists.length === 0 || !service?.active ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground" role="status">
          {booking("noParentSupport")}
        </p>
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <SlotBookingForm
            dependents={dependents}
            initialChoice={initialChoice}
            initialSlots={initialSlots}
            locale={locale}
            serviceType="parent_support"
            specialists={specialists}
          />
        </div>
      )}
    </section>
  );
}
