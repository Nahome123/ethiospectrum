import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SupportFilters } from "@/components/support/support-filters";
import { SUPPORT_PAGE_SIZE } from "@/lib/support/constants";
import { parseSupportQuery, supportQueryString } from "@/lib/support/query-state";
import { listAdminSupportRequests } from "@/lib/support/server";

export const dynamic = "force-dynamic";

export default async function AdminSupportRequestsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const query = parseSupportQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: "support" });
  const loadedRequests = await listAdminSupportRequests(query);
  if (loadedRequests === null) {
    return (
      <section className="max-w-5xl">
        <h1 className="text-3xl font-bold">{t("adminTitle")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("loadError")}
        </p>
        <Link className="mt-3 inline-block text-sm font-semibold underline" href="/admin/support-requests">
          {t("tryAgain")}
        </Link>
      </section>
    );
  }
  const requests = loadedRequests;
  const total = requests[0]?.total_count ?? 0;
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const previous = { ...query, page: Math.max(1, query.page - 1) };
  const next = { ...query, page: query.page + 1 };

  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
          {t("readOnlyTriage")}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{t("adminTitle")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{t("adminDescription")}</p>
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("adminReadOnlyNotice")} {t("specialistAssignmentNotice")}
      </p>
      <SupportFilters basePath="/admin/support-requests" locale={locale} query={query} />
      {requests.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{t("noRequests")}</h2>
        </div>
      ) : (
        <>
          <ul aria-label={t("requestList")} className="grid gap-3">
            {requests.map((request) => (
              <li className="rounded-2xl border border-border bg-white p-5" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-lg font-bold [overflow-wrap:anywhere]">
                    <Link className="hover:underline" href={`/admin/support-requests/${request.id}`}>
                      {request.subject}
                    </Link>
                  </h2>
                  <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                    {t(`statuses.${request.status}`)}
                  </span>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("household")}:</dt>
                    <dd className="break-words [overflow-wrap:anywhere]">{request.household_label}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("category")}:</dt>
                    <dd>{t(`categories.${request.category}`)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("preferredLanguage")}:</dt>
                    <dd>{t(`languages.${request.preferred_language}`)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("created")}:</dt>
                    <dd>{formatDate(request.created_at)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("lastActivity")}:</dt>
                    <dd>{formatDate(request.last_activity_at)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{t("messages")}:</dt>
                    <dd>{t("messageCount", { count: request.message_count })}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          {total > SUPPORT_PAGE_SIZE ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              {query.page > 1 ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/admin/support-requests${supportQueryString(previous)}`}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">{t("page", { page: query.page })}</p>
              {query.page * SUPPORT_PAGE_SIZE < total ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/admin/support-requests${supportQueryString(next)}`}
                >
                  {t("next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
