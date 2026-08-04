import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { SupportRequest } from "@/lib/support/server";

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

const statusStyles: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  closed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export async function SupportStatusBadge({ locale, status }: { locale: AppLocale; status: string }) {
  const t = await getTranslations({ locale, namespace: "support" });
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status] ?? "bg-secondary"}`}
    >
      {t(`statuses.${status}`)}
    </span>
  );
}

export async function SupportRequestCard({
  locale,
  request,
}: {
  locale: AppLocale;
  request: SupportRequest;
}) {
  const t = await getTranslations({ locale, namespace: "support" });
  return (
    <li className="rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-lg font-bold [overflow-wrap:anywhere]">
          <Link className="hover:underline" href={`/support/${request.id}`}>
            {request.subject}
          </Link>
        </h2>
        <SupportStatusBadge locale={locale} status={request.status} />
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("category")}:</dt>
          <dd>{t(`categories.${request.category}`)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("requestedBy")}:</dt>
          <dd className="break-words [overflow-wrap:anywhere]">
            {request.requester_is_self ? t("you") : request.requester_name}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("created")}:</dt>
          <dd>{formatDate(request.created_at, locale)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("lastActivity")}:</dt>
          <dd>{formatDate(request.last_activity_at, locale)}</dd>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold">{t("messages")}:</dt>
          <dd>{t("messageCount", { count: request.message_count })}</dd>
        </div>
      </dl>
      <Link className="mt-4 inline-block text-sm font-semibold underline" href={`/support/${request.id}`}>
        {t("viewRequest")}
      </Link>
    </li>
  );
}
