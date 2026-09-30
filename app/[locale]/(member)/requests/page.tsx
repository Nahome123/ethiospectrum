import { getTranslations } from "next-intl/server";
import { PaymentStatusBadge, ServiceStatusBadge } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatShortDateTime } from "@/lib/services/display";
import { listHouseholdServiceRequests } from "@/lib/services/server";

const filters = ["active", "closed", "all"] as const;

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.requests" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const filter = filters.find((value) => value === search.filter) ?? "active";
  const page = Math.max(1, Number(search.page) || 1);
  const access = await getHouseholdAccess();
  const requests = access ? await listHouseholdServiceRequests(filter === "all" ? null : filter, page) : [];
  const total = Number(requests?.[0]?.total_count ?? 0);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{access?.household.name}</p>
          <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>
        {access?.permissions.includes("submit_requests") ? (
          <Link
            className="min-h-10 content-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/services"
          >
            {t("newRequest")}
          </Link>
        ) : null}
      </div>
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        {filters.map((value) => (
          <Link
            aria-current={filter === value ? "page" : undefined}
            className={
              filter === value
                ? "rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
                : "rounded-full border px-4 py-1.5 text-sm font-semibold"
            }
            href={`/requests?filter=${value}`}
            key={value}
          >
            {t(`filters.${value}`)}
          </Link>
        ))}
      </nav>
      {requests === null ? (
        <p role="alert">{t("loadError")}</p>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ul aria-label={t("title")} className="grid gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                className="block rounded-2xl border bg-white p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                href={`/requests/${request.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{types(request.service_type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.dependent_name}
                      {request.specialist_name ? ` · ${request.specialist_name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ServiceStatusBadge status={request.status} />
                    <PaymentStatusBadge status={request.payment_status} />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {request.next_appointment_at
                    ? t("nextAppointment", { date: formatShortDateTime(request.next_appointment_at, locale) })
                    : t("updated", { date: formatShortDateTime(request.updated_at, locale) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > 20 ? (
        <nav aria-label={t("pagination")} className="flex justify-between">
          {page > 1 ? (
            <Link
              className="rounded-md border px-3 py-2 text-sm font-semibold"
              href={`/requests?filter=${filter}&page=${page - 1}`}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {page * 20 < total ? (
            <Link
              className="rounded-md border px-3 py-2 text-sm font-semibold"
              href={`/requests?filter=${filter}&page=${page + 1}`}
            >
              {t("next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
