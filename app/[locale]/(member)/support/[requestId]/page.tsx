import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SupportMessageForm } from "@/components/support/support-message-form";
import { SupportRequestActions } from "@/components/support/support-request-actions";
import { SupportStatusBadge } from "@/components/support/support-request-card";
import { supportRequestIdSchema } from "@/lib/validation/support";
import { getSupportContext, getSupportRequest, getSupportRequestMessages } from "@/lib/support/server";

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function SupportRequestPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; requestId: string }> }>) {
  const { locale: localeParam, requestId } = await params;
  const locale = localeParam as AppLocale;
  if (!supportRequestIdSchema.safeParse(requestId).success) notFound();
  const [t, context, request] = await Promise.all([
    getTranslations({ locale, namespace: "support" }),
    getSupportContext(),
    getSupportRequest(requestId),
  ]);
  if (!context || !request) notFound();
  const messages = await getSupportRequestMessages(requestId);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link className="text-sm font-semibold underline" href="/support">
          {t("backToSupport")}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-3xl font-bold [overflow-wrap:anywhere]">
            {request.subject}
          </h1>
          <SupportStatusBadge locale={locale} status={request.status} />
        </div>
      </div>

      {request.status !== "open" ? (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold" role="status">
          {request.status === "closed" ? t("closedExplanation") : t("cancelledExplanation")}
        </p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-white p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("category")}:</dt>
          <dd>{t(`categories.${request.category}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("preferredLanguage")}:</dt>
          <dd>{t(`languages.${request.preferred_language}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("requestedBy")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">
            {request.requester_is_self ? t("you") : request.requester_name}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("created")}:</dt>
          <dd>{formatDateTime(request.created_at, locale)}</dd>
        </div>
      </dl>

      <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm leading-6">
        {t("visibilityNotice")}
      </p>

      {request.can_close || request.can_cancel ? (
        <SupportRequestActions
          canCancel={request.can_cancel}
          canClose={request.can_close}
          locale={locale}
          requestId={request.id}
          version={request.version}
        />
      ) : null}

      <section aria-label={t("messagesTitle")}>
        <h2 className="text-xl font-bold">{t("messagesTitle")}</h2>
        {messages.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t("noMessages")}</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {messages.map((message) => (
              <li className="rounded-xl border border-border bg-white p-4" key={message.id}>
                <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {message.author_is_self ? t("you") : message.author_name}
                    {message.author_is_former ? ` (${t("formerMember")})` : ""}
                  </span>
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

      {request.status === "open" && request.can_message ? (
        <SupportMessageForm locale={locale} requestId={request.id} />
      ) : null}
    </section>
  );
}
