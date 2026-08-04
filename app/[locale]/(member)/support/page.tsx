import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SupportFilters } from "@/components/support/support-filters";
import { SupportRequestCard } from "@/components/support/support-request-card";
import { SUPPORT_PAGE_SIZE } from "@/lib/support/constants";
import { parseSupportQuery, supportQueryString } from "@/lib/support/query-state";
import { getSupportContext, listSupportRequests } from "@/lib/support/server";

export default async function SupportPage({
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
  const context = await getSupportContext();
  if (!context) {
    return (
      <section className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("accessDenied")}
        </p>
      </section>
    );
  }

  const loadedRequests = await listSupportRequests(query);
  if (loadedRequests === null) {
    return (
      <section className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("loadError")}
        </p>
        <Link className="mt-3 inline-block text-sm font-semibold underline" href="/support">
          {t("tryAgain")}
        </Link>
      </section>
    );
  }
  const requests = loadedRequests;
  const total = requests[0]?.total_count ?? 0;
  const hasFilters = Boolean(query.status || query.category);
  const previous = { ...query, page: Math.max(1, query.page - 1) };
  const next = { ...query, page: query.page + 1 };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{context.household.name}</p>
          <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t("listDescription")}</p>
        </div>
        {context.canCreate ? (
          <Link
            className="min-h-10 content-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/support/new"
          >
            {t("askForSupport")}
          </Link>
        ) : (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold" role="status">
            {t("readOnly")}
          </p>
        )}
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6">
        {t("nonEmergencyNotice")}
      </p>
      <SupportFilters basePath="/support" locale={locale} query={query} />
      {requests.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{hasFilters ? t("noMatchingRequests") : t("noRequests")}</h2>
          <p className="mt-2 text-muted-foreground">
            {context.canCreate ? t("emptyDescription") : t("readOnlyDescription")}
          </p>
        </div>
      ) : (
        <>
          <ul aria-label={t("requestList")} className="grid gap-4">
            {requests.map((request) => (
              <SupportRequestCard key={request.id} locale={locale} request={request} />
            ))}
          </ul>
          {total > SUPPORT_PAGE_SIZE ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              {query.page > 1 ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/support${supportQueryString(previous)}`}
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
                  href={`/support${supportQueryString(next)}`}
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
