import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatUnreadCount, getUnreadNotificationCount } from "@/lib/notifications/server";
import { cn } from "@/lib/utils";

export async function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const t = await getTranslations("notifications");
  const count = await getUnreadNotificationCount();
  const badge = formatUnreadCount(count);
  return (
    <Link
      aria-label={badge ? t("bellUnread", { count: badge }) : t("bell")}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        onDark ? "border-slate-600 text-white hover:bg-slate-800" : "border-border hover:bg-secondary",
      )}
      href="/notifications"
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
