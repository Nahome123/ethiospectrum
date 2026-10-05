import "server-only";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { NotificationAudience } from "./audience";

export type NotificationItem = Database["public"]["Functions"]["list_notifications"]["Returns"][number];

export async function getUnreadNotificationCount(audience: NotificationAudience): Promise<number> {
  try {
    const supabase = await createServerComponentSupabaseClient();
    const { data, error } = await supabase.rpc("get_notification_summary", { input_audience: audience });
    return error || !data?.[0] ? 0 : Number(data[0].unread_count);
  } catch {
    return 0;
  }
}

export async function listNotifications(
  page: number,
  audience: NotificationAudience,
): Promise<NotificationItem[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_notifications", {
    input_page: page,
    input_audience: audience,
  });
  return error || !data ? null : data;
}

export function formatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
