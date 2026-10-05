/** Each workspace shows only its own notifications. */
export const notificationAudiences = ["family", "specialist", "admin"] as const;
export type NotificationAudience = (typeof notificationAudiences)[number];

const audiencePaths: Record<NotificationAudience, string> = {
  family: "/notifications",
  specialist: "/specialist/notifications",
  admin: "/admin/notifications",
};

/** Locale-free path, for the i18n Link component. */
export function notificationsPath(audience: NotificationAudience): string {
  return audiencePaths[audience];
}

export function isNotificationAudience(value: unknown): value is NotificationAudience {
  return typeof value === "string" && (notificationAudiences as readonly string[]).includes(value);
}
