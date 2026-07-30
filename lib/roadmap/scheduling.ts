import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareReminderReschedule } from "@/lib/reminders/reschedule";
import type { Database } from "@/lib/supabase/database.types";

type RescheduleInput =
  | {
      expectedScheduleVersion: number;
      id: string;
      kind: "cancelled";
    }
  | {
      expectedScheduleVersion: number;
      id: string;
      kind: "rescheduled";
      scheduledForUtc: string;
      scheduledLocalDate: string;
      timezoneOffsetMinutes: number;
    };

type RoadmapReschedulingContext =
  | { dueDateChanged: false; schedules: [] }
  | { dueDateChanged: true; schedules: RescheduleInput[] }
  | { dueDateChanged: false; schedules: null };

/**
 * Builds trusted schedule values from reminder data visible to the signed-in
 * household member. The caller passes these values to the atomic database RPC.
 */
export async function getRoadmapReschedulingContext(
  supabase: SupabaseClient<Database>,
  itemId: string,
  nextDueDate: string | null | undefined,
): Promise<RoadmapReschedulingContext> {
  const currentItem = await supabase.from("roadmap_items").select("due_date").eq("id", itemId).maybeSingle();
  if (currentItem.error || !currentItem.data) return { dueDateChanged: false, schedules: null };
  if (currentItem.data.due_date === nextDueDate) return { dueDateChanged: false, schedules: [] };

  const scheduledItems = await supabase
    .from("reminders")
    .select("id, offset_days, scheduled_local_time, schedule_version, timezone")
    .eq("roadmap_item_id", itemId)
    .eq("status", "scheduled");
  if (scheduledItems.error || !scheduledItems.data) return { dueDateChanged: false, schedules: null };

  return {
    dueDateChanged: true,
    schedules: scheduledItems.data.map((scheduledItem) => {
      if (
        !nextDueDate ||
        scheduledItem.offset_days === null ||
        !scheduledItem.scheduled_local_time ||
        !scheduledItem.timezone
      ) {
        return {
          expectedScheduleVersion: scheduledItem.schedule_version,
          id: scheduledItem.id,
          kind: "cancelled",
        };
      }

      const prepared = prepareReminderReschedule({
        dueDate: nextDueDate,
        localTime: scheduledItem.scheduled_local_time.slice(0, 5),
        offsetDays: scheduledItem.offset_days as 0 | 1 | 3 | 7,
        timezone: scheduledItem.timezone,
      });
      return {
        expectedScheduleVersion: scheduledItem.schedule_version,
        id: scheduledItem.id,
        ...prepared,
      };
    }),
  };
}
