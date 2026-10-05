import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { notificationsPath, type NotificationAudience } from "@/lib/notifications/audience";
import { markNotificationsReadAction } from "@/lib/notifications/actions";
import {
  isKnownNotificationType,
  notificationValues,
  safeNotificationPath,
} from "@/lib/notifications/content";
import { listNotifications } from "@/lib/notifications/server";
import { formatCents } from "@/lib/services/constants";
import { formatShortDateTime } from "@/lib/services/display";

/** One workspace's notifications; each workspace renders this with its own audience. */
export async function NotificationList({
  audience,
  locale,
  search,
}: {
  audience: NotificationAudience;
  locale: AppLocale;
  search: Record<string, string | string[] | undefined>;
}) {
  const basePath = notificationsPath(audience);
  const t = await getTranslations({ locale, namespace: "notifications" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const page = Math.max(1, Number(search.page) || 1);
  const items = await listNotifications(page, audience);
  const total = Number(items?.[0]?.total_count ?? 0);
  const hasUnread = (items ?? []).some((item) => !item.read_at);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>
        {hasUnread ? (
          <form action={markNotificationsReadAction.bind(null, locale, audience)}>
            <Button type="submit" variant="outline">
              {t("markAllRead")}
            </Button>
          </form>
        ) : null}
      </div>
      {items === null ? (
        <p role="alert">{t("loadError")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const known = isKnownNotificationType(item.notification_type);
            const values = notificationValues(item.payload, {
              serviceName: (type) =>
                ["rbt_bootcamp", "consultation", "iep_language_assistance"].includes(type) ? types(type) : "",
              formatDate: (iso) => formatShortDateTime(iso, locale),
              formatAmount: (cents) => formatCents(cents, locale),
            });
            const path = safeNotificationPath(item.link_path);
            return (
              <li
                className={
                  item.read_at
                    ? "rounded-2xl border bg-white p-4"
                    : "rounded-2xl border-2 border-primary/40 bg-white p-4"
                }
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">
                    {!item.read_at ? <span className="sr-only">{t("unread")}: </span> : null}
                    {known ? t(`types.${item.notification_type}.title`, values) : t("generic")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatShortDateTime(item.created_at, locale)}
                  </p>
                </div>
                {known ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`types.${item.notification_type}.body`, values)}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  {path ? (
                    <Link className="text-sm font-semibold text-primary underline" href={path}>
                      {t("open")}
                    </Link>
                  ) : null}
                  {!item.read_at ? (
                    <form action={markNotificationsReadAction.bind(null, locale, audience)}>
                      <input name="notificationId" type="hidden" value={item.id} />
                      <button className="text-sm font-semibold underline" type="submit">
                        {t("markRead")}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {total > 20 ? (
        <nav aria-label={t("pagination")} className="flex justify-between">
          {page > 1 ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={`${basePath}?page=${page - 1}`}
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          {page * 20 < total ? (
            <Link
              className="rounded-md border bg-white px-3 py-2 text-sm font-semibold"
              href={`${basePath}?page=${page + 1}`}
            >
              {t("next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
