import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notificationsPath, type NotificationAudience } from "@/lib/notifications/audience";
import { formatUnreadCount, getUnreadNotificationCount } from "@/lib/notifications/server";
import { cn } from "@/lib/utils";

/** Links to, and counts, only the given workspace's notifications. */
export async function NotificationBell({
  audience,
  onDark = false,
}: {
  audience: NotificationAudience;
  onDark?: boolean;
}) {
  const t = await getTranslations("notifications");
  const count = await getUnreadNotificationCount(audience);
  const badge = formatUnreadCount(count);
  return (
    <Link
      aria-label={badge ? t("bellUnread", { count: badge }) : t("bell")}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        onDark
          ? "border-nav-hover text-nav-foreground hover:bg-nav-hover"
          : "border-border hover:bg-secondary",
      )}
      href={notificationsPath(audience)}
    >
      <Bell aria-hidden="true" className="size-4" />
      {badge ? (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
