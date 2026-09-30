import "server-only";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type NotificationItem = Database["public"]["Functions"]["list_notifications"]["Returns"][number];

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const supabase = await createServerComponentSupabaseClient();
    const { data, error } = await supabase.rpc("get_notification_summary");
    return error || !data?.[0] ? 0 : Number(data[0].unread_count);
  } catch {
    return 0;
  }
}

export async function listNotifications(page: number): Promise<NotificationItem[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_notifications", { input_page: page });
  return error || !data ? null : data;
}

export function formatUnreadCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
