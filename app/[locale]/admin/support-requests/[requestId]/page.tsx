import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { supportRequestIdSchema } from "@/lib/validation/support";
import { getAdminSupportRequest, getSupportRequestMessages } from "@/lib/support/server";

export const dynamic = "force-dynamic";

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AdminSupportRequestPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; requestId: string }> }>) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  if (!supportRequestIdSchema.safeParse(requestId).success) notFound();
  const [t, request] = await Promise.all([
    getTranslations({ locale, namespace: "support" }),
    getAdminSupportRequest(requestId),
  ]);
  if (!request) notFound();
  const messages = await getSupportRequestMessages(requestId);

  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/admin/support-requests">
          {t("backToTriage")}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-3xl font-bold [overflow-wrap:anywhere]">
            {request.subject}
          </h1>
          <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
            {t(`statuses.${request.status}`)}
          </span>
        </div>
      </div>
      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6" role="note">
        {t("adminReadOnlyNotice")} {t("specialistAssignmentUnavailable")}
      </p>
      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-white p-5 text-sm sm:grid-cols-2">
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
          <dd>{formatDateTime(request.created_at, locale)}</dd>
        </div>
      </dl>
      <section aria-label={t("messagesTitle")}>
        <h2 className="text-xl font-bold">{t("messagesTitle")}</h2>
        {messages.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t("noMessages")}</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {messages.map((message) => (
              <li className="rounded-xl border border-border bg-white p-4" key={message.id}>
                <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{message.author_name}</span>
                  <span>{formatDateTime(message.created_at, locale)}</span>
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">
                  {message.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
