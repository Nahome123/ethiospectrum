"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { isNotificationAudience, notificationsPath, type NotificationAudience } from "./audience";

/**
 * Marks one notification (or all of one workspace's, without an id) read for
 * the signed-in recipient only.
 */
export async function markNotificationsReadAction(
  locale: AppLocale,
  audience: NotificationAudience,
  formData: FormData,
): Promise<void> {
  if (!isNotificationAudience(audience)) return;
  const raw = formData.get("notificationId");
  const id = typeof raw === "string" && raw ? z.uuid().safeParse(raw) : null;
  if (id && !id.success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("mark_notifications_read", {
    target_ids: id ? [id.data] : undefined,
    input_audience: audience,
  });
  revalidatePath(`/${locale}${notificationsPath(audience)}`);
  revalidatePath(`/${locale}`, "layout");
}
