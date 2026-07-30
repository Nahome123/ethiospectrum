import "server-only";

import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export type PersonalReminder = {
  id: string;
  roadmap_item_id: string;
  status: string;
  offset_days: number | null;
  scheduled_local_date: string | null;
  scheduled_local_time: string | null;
  timezone: string | null;
  delivered_at: string | null;
  seen_at: string | null;
  cancellation_reason: string | null;
  schedule_version: number;
  updated_at: string;
};

const reminderFields =
  "id, roadmap_item_id, status, offset_days, scheduled_local_date, scheduled_local_time, timezone, delivered_at, seen_at, cancellation_reason, schedule_version, updated_at";

export async function getPersonalReminders(): Promise<PersonalReminder[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("reminders")
    .select(reminderFields)
    .order("scheduled_for_utc", { ascending: false })
    .limit(100);
  return error || !data ? [] : data;
}

export async function getPersonalReminder(reminderId: string): Promise<PersonalReminder | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("reminders")
    .select(reminderFields)
    .eq("id", reminderId)
    .maybeSingle();
  return error || !data ? null : data;
}

export function formatUnseenReminderCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export async function getUnseenReminderCount(): Promise<number> {
  const supabase = await createServerComponentSupabaseClient();
  const { count, error } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "delivered")
    .is("seen_at", null)
    .limit(100);
  return error ? 0 : Math.min(count ?? 0, 100);
}
