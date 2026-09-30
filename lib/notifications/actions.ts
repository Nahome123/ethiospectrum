"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";

/** Marks one notification (or all, without an id) read for the signed-in recipient only. */
export async function markNotificationsReadAction(locale: AppLocale, formData: FormData): Promise<void> {
  const raw = formData.get("notificationId");
  const id = typeof raw === "string" && raw ? z.uuid().safeParse(raw) : null;
  if (id && !id.success) return;
  const supabase = await createServerActionSupabaseClient();
  await supabase.rpc("mark_notifications_read", { target_ids: id ? [id.data] : undefined });
  revalidatePath(`/${locale}/notifications`);
  revalidatePath(`/${locale}`, "layout");
}
