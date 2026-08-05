import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SPECIALIST_WORKLOAD_PAGE_SIZE } from "@/lib/specialists/constants";
import { listSpecialistSupportRequests } from "@/lib/specialists/server";
import { specialistPageSchema } from "@/lib/validation/specialists";

export const dynamic = "force-dynamic";

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

export default async function SpecialistSupportRequestsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const rawPage = (await searchParams).page;
  const parsedPage = specialistPageSchema.safeParse(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const page = parsedPage.success ? parsedPage.data : 1;
  const [t, supportTranslations] = await Promise.all([
    getTranslations({ locale, namespace: "specialists" }),
    getTranslations({ locale, namespace: "support" }),
  ]);
  const requests = await listSpecialistSupportRequests(page);

  if (requests === null) {
    return (
      <section className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">{t("workloadTitle")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("loadError")}
        </p>
        <Link
          className="mt-3 inline-block text-sm font-semibold underline"
          href="/specialist/support-requests"
        >
          {t("tryAgain")}
        </Link>
      </section>
    );
  }

  const total = requests[0]?.total_count ?? 0;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("workloadTitle")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{t("workloadDescription")}</p>
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("specialistScopeNotice")}
      </p>
      {requests.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold">{t("noAssignedRequests")}</h2>
          <p className="mt-2 text-muted-foreground">{t("noAssignedRequestsDescription")}</p>
        </div>
      ) : (
        <>
          <ul aria-label={t("assignedRequests")} className="grid gap-4">
            {requests.map((request) => (
              <li className="rounded-2xl border border-border bg-white p-5" key={request.id}>
                <h2 className="min-w-0 break-words text-lg font-bold [overflow-wrap:anywhere]">
                  <Link className="hover:underline" href={`/specialist/support-requests/${request.id}`}>
                    {request.subject}
                  </Link>
                </h2>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{supportTranslations("category")}:</dt>
                    <dd>{supportTranslations(`categories.${request.category}`)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{supportTranslations("preferredLanguage")}:</dt>
                    <dd>{supportTranslations(`languages.${request.preferred_language}`)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{supportTranslations("created")}:</dt>
                    <dd>{formatDate(request.created_at, locale)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{supportTranslations("lastActivity")}:</dt>
                    <dd>{formatDate(request.last_activity_at, locale)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">{supportTranslations("messages")}:</dt>
                    <dd>{supportTranslations("messageCount", { count: request.message_count })}</dd>
                  </div>
                </dl>
                <Link
                  className="mt-4 inline-block text-sm font-semibold underline"
                  href={`/specialist/support-requests/${request.id}`}
                >
                  {t("openRequest")}
                </Link>
              </li>
            ))}
          </ul>
          {total > SPECIALIST_WORKLOAD_PAGE_SIZE ? (
            <nav
              aria-label={supportTranslations("pagination")}
              className="flex items-center justify-between gap-3"
            >
              {page > 1 ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/specialist/support-requests?page=${page - 1}`}
                >
                  {supportTranslations("previous")}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">{supportTranslations("page", { page })}</p>
              {page * SPECIALIST_WORKLOAD_PAGE_SIZE < total ? (
                <Link
                  className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                  href={`/specialist/support-requests?page=${page + 1}`}
                >
                  {supportTranslations("next")}
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
