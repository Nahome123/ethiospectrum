import { getTranslations } from "next-intl/server";
import { PaymentStatusBadge, ServiceStatusBadge, StatusPill } from "@/components/services/status-badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { adminQueueValues, type AdminQueue } from "@/lib/services/constants";
import { formatShortDateTime } from "@/lib/services/display";
import { getAdminQueueCounts, listAdminServiceRequests } from "@/lib/services/server";
import { adminQueueSchema } from "@/lib/validation/services";

const serviceFilters = ["consultation", "iep_language_assistance"] as const;

export default async function AdminServiceRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const delivery = await getTranslations({ locale, namespace: "services.deliveryMethods" });
  const parsedQueue = adminQueueSchema.safeParse(search.queue);
  const queue: AdminQueue = parsedQueue.success ? parsedQueue.data : "all";
  const serviceType = serviceFilters.find((value) => value === search.service) ?? null;
  const page = Math.max(1, Number(search.page) || 1);
  const [requests, counts] = await Promise.all([
    listAdminServiceRequests(queue, serviceType, page),
    getAdminQueueCounts(),
  ]);
  const total = Number(requests?.[0]?.total_count ?? 0);
  const query = (next: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    const merged = { queue, service: serviceType, page: 1, ...next };
    for (const [key, value] of Object.entries(merged))
      if (value !== null && value !== "all" && !(key === "page" && value === 1))
        params.set(key, String(value));
    const text = params.toString();
    return text ? `/admin/service-requests?${text}` : "/admin/service-requests";
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("queueTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("queueDescription")}</p>
      </div>
      <nav aria-label={t("queues")} className="flex flex-wrap gap-2">
        {(["all", ...adminQueueValues] as AdminQueue[]).map((value) => (
          <Link
            aria-current={queue === value ? "page" : undefined}
            className={
              queue === value
                ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                : "rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold"
            }
            href={query({ queue: value })}
            key={value}
          >
            {t(`queue.${value}`)}
            {value !== "all" && counts[value] ? (
              <span className="ml-1.5 opacity-70">{counts[value]}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      <nav aria-label={t("serviceFilter")} className="flex flex-wrap gap-2 text-sm">
        <Link
          className={serviceType === null ? "font-bold underline" : "underline"}
          href={query({ service: null })}
        >
          {t("allServices")}
        </Link>
        {serviceFilters.map((value) => (
          <Link
            className={serviceType === value ? "font-bold underline" : "underline"}
            href={query({ service: value })}
            key={value}
          >
            {types(value)}
          </Link>
        ))}
      </nav>
      {requests === null ? (
        <p role="alert">{t("loadError")}</p>
      ) : requests.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("emptyQueue")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">{t(`queue.${queue}`)}</caption>
            <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3" scope="col">
                  {t("columns.request")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.household")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.specialist")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.status")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.next")}
                </th>
                <th className="px-4 py-3" scope="col">
                  {t("columns.updated")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((request) => (
                <tr className="align-top" key={request.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-link underline"
                      href={`/admin/service-requests/${request.id}`}
                    >
                      {types(request.service_type)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {languages(request.language)} · {delivery(request.delivery_method)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {request.household_name}
                    <p className="text-xs text-muted-foreground">{request.dependent_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    {request.specialist_name ?? <StatusPill label={t("unassigned")} tone="warning" />}
                  </td>
                  <td className="space-y-1 px-4 py-3">
                    <ServiceStatusBadge status={request.status} />
                    <div>
                      <PaymentStatusBadge status={request.payment_status} />
                    </div>
                    {Number(request.open_refund_count) > 0 ? (
                      <StatusPill label={t("refundPending")} tone="warning" />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {request.next_appointment_at
                      ? formatShortDateTime(request.next_appointment_at, locale)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{formatShortDateTime(request.updated_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 25 ? (
        <nav aria-label={t("pagination")} className="flex justify-between">
          {page > 1 ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={query({ page: page - 1 })}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {page * 25 < total ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={query({ page: page + 1 })}
            >
              {t("next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
