"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { getStripeClient } from "@/lib/billing/provider";
import { getStripeBillingEnv } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSupabaseClaims, getCurrentUserRole } from "@/lib/supabase/server";
import { deleteMember, getMemberDeletionPreview, MemberDeletionError } from "./member-deletion";

export type DeleteMemberState = { status: "idle" } | { status: "error"; message: string };

function stripeIfConfigured() {
  try {
    return getStripeBillingEnv() ? getStripeClient() : null;
  } catch {
    return null;
  }
}

/**
 * Administrator: permanently delete a member and everything they own. The
 * administrator must type the member's email address to confirm.
 */
export async function deleteMemberAction(
  locale: AppLocale,
  userId: string,
  _state: DeleteMemberState,
  formData: FormData,
): Promise<DeleteMemberState> {
  const t = await getTranslations({ locale, namespace: "adminConsole.deleteMember" });
  const claims = await getCurrentSupabaseClaims();
  if (!z.uuid().safeParse(userId).success || !claims || typeof claims.sub !== "string") {
    return { status: "error", message: t("errors.invalid") };
  }
  if ((await getCurrentUserRole(claims.sub)) !== "administrator") {
    return { status: "error", message: t("errors.denied") };
  }
  if (userId === claims.sub) return { status: "error", message: t("errors.self") };

  const admin = createSupabaseAdminClient();
  const preview = await getMemberDeletionPreview(admin, userId);
  if (!preview) return { status: "error", message: t("errors.notFound") };
  if (preview.role === "administrator") return { status: "error", message: t("errors.administrator") };

  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!typed || typed !== preview.email) return { status: "error", message: t("errors.emailMismatch") };
  const reasonValue = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);

  try {
    await deleteMember({
      actorId: claims.sub,
      admin,
      preview,
      reason: reasonValue || null,
      stripe: stripeIfConfigured(),
    });
  } catch (error) {
    const step = error instanceof MemberDeletionError ? error.step : "account";
    return { status: "error", message: t(`errors.${step}`) };
  }

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/billing`);
  redirect(`/${locale}/admin/users?deleted=1`);
}
