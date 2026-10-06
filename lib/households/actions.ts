"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/auth/site-url";
import { serviceErrorKey } from "@/lib/services/action-state";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { caregiverPermissionValues } from "./caregivers";

export type HouseholdActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; inviteUrl?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function permissionsFrom(formData: FormData) {
  return z
    .array(z.enum(caregiverPermissionValues))
    .max(caregiverPermissionValues.length)
    .safeParse(formData.getAll("permissions").filter((value) => typeof value === "string"));
}

async function error(locale: AppLocale, code?: string): Promise<HouseholdActionState> {
  const t = await getTranslations({ locale, namespace: "household.errors" });
  const key = serviceErrorKey(code);
  return {
    status: "error",
    message: t(["denied", "limit", "state", "validation"].includes(key) ? key : "generic"),
  };
}

function revalidateHousehold(locale: AppLocale) {
  revalidatePath(`/${locale}/household`);
  revalidatePath(`/${locale}/dashboard`);
}

export async function inviteCaregiverAction(
  locale: AppLocale,
  _state: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const email = z.email().max(254).safeParse(field(formData, "email").trim());
  const permissions = permissionsFrom(formData);
  if (!email.success || !permissions.success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc("create_caregiver_invitation", {
    input_email: email.data,
    input_permissions: permissions.data,
  });
  const token = data?.[0]?.invitation_token;
  if (rpcError || !token) return error(locale, rpcError?.code);
  revalidateHousehold(locale);
  const t = await getTranslations({ locale, namespace: "household" });
  // Returned once so the owner can share it directly when email delivery is not configured.
  return {
    status: "success",
    message: t("inviteSent"),
    inviteUrl: `${getSiteUrl()}/${locale}/invitations/${token}`,
  };
}

export async function revokeInvitationAction(
  locale: AppLocale,
  invitationId: string,
  _state: HouseholdActionState,
  _formData: FormData,
): Promise<HouseholdActionState> {
  void _formData;
  if (!z.uuid().safeParse(invitationId).success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { error: rpcError } = await supabase.rpc("revoke_caregiver_invitation", {
    target_invitation_id: invitationId,
  });
  if (rpcError) return error(locale, rpcError.code);
  revalidateHousehold(locale);
  const t = await getTranslations({ locale, namespace: "household" });
  return { status: "success", message: t("inviteRevoked") };
}

export async function updateCaregiverPermissionsAction(
  locale: AppLocale,
  memberId: string,
  _state: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const permissions = permissionsFrom(formData);
  if (!z.uuid().safeParse(memberId).success || !permissions.success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { error: rpcError } = await supabase.rpc("update_caregiver_permissions", {
    target_member_id: memberId,
    input_permissions: permissions.data,
  });
  if (rpcError) return error(locale, rpcError.code);
  revalidateHousehold(locale);
  const t = await getTranslations({ locale, namespace: "household" });
  return { status: "success", message: t("permissionsSaved") };
}

export async function removeCaregiverAction(
  locale: AppLocale,
  memberId: string,
  _state: HouseholdActionState,
  _formData: FormData,
): Promise<HouseholdActionState> {
  void _formData;
  if (!z.uuid().safeParse(memberId).success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { error: rpcError } = await supabase.rpc("remove_caregiver", { target_member_id: memberId });
  if (rpcError) return error(locale, rpcError.code);
  revalidateHousehold(locale);
  const t = await getTranslations({ locale, namespace: "household" });
  return { status: "success", message: t("caregiverRemoved") };
}

const phoneSchema = z
  .string()
  .trim()
  .regex(/^([0-9+() .-]{7,32})?$/)
  .transform((value) => (value === "" ? null : value));

export async function updateHouseholdContactAction(
  locale: AppLocale,
  householdId: string,
  _state: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const parsed = z
    .object({
      id: z.uuid(),
      name: z.string().trim().min(1).max(160),
      phone: phoneSchema,
      email: z
        .union([z.email().max(254), z.literal("")])
        .transform((value) => (value === "" ? null : value.toLowerCase())),
      notes: z
        .string()
        .trim()
        .max(1000)
        .transform((value) => (value === "" ? null : value)),
    })
    .safeParse({
      id: householdId,
      name: field(formData, "name"),
      phone: field(formData, "contactPhone"),
      email: field(formData, "contactEmail").trim(),
      notes: field(formData, "contactNotes"),
    });
  if (!parsed.success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { data, error: updateError } = await supabase
    .from("households")
    .update({
      name: parsed.data.name,
      contact_phone: parsed.data.phone,
      contact_email: parsed.data.email,
      contact_notes: parsed.data.notes,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (updateError || !data) return error(locale, updateError?.code ?? "42501");
  revalidateHousehold(locale);
  const t = await getTranslations({ locale, namespace: "household" });
  return { status: "success", message: t("contactSaved") };
}

export async function acceptInvitationAction(
  locale: AppLocale,
  token: string,
  _state: HouseholdActionState,
  _formData: FormData,
): Promise<HouseholdActionState> {
  void _formData;
  if (!/^[0-9a-f]{64}$/.test(token)) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { error: rpcError } = await supabase.rpc("accept_caregiver_invitation", { input_token: token });
  if (rpcError) {
    const t = await getTranslations({ locale, namespace: "household.errors" });
    if (rpcError.code === "42501") return { status: "error", message: t("wrongAccount") };
    if (rpcError.code === "54000") return { status: "error", message: t("alreadyInHousehold") };
    return { status: "error", message: t("invitationUnavailable") };
  }
  revalidateHousehold(locale);
  redirect(`/${locale}/dashboard?joined=1`);
}

export async function updateProfileAction(
  locale: AppLocale,
  _state: HouseholdActionState,
  formData: FormData,
): Promise<HouseholdActionState> {
  const parsed = z
    .object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().max(80),
      phone: phoneSchema,
      preferredLocale: z.enum(["en", "am", "es"]),
      timezone: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/),
    })
    .safeParse({
      firstName: field(formData, "firstName"),
      lastName: field(formData, "lastName"),
      phone: field(formData, "phone"),
      preferredLocale: field(formData, "preferredLocale"),
      timezone: field(formData, "timezone"),
    });
  if (!parsed.success) return error(locale, "22023");
  const supabase = await createServerActionSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return error(locale, "42501");
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || null,
      phone: parsed.data.phone,
      preferred_locale: parsed.data.preferredLocale,
      timezone: parsed.data.timezone,
    })
    .eq("id", userId);
  if (updateError) return error(locale, updateError.code);
  revalidatePath(`/${locale}/settings`);
  revalidatePath(`/${locale}/specialist/settings`);
  const t = await getTranslations({ locale, namespace: "household" });
  return { status: "success", message: t("profileSaved") };
}
