"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { serviceErrorKey } from "@/lib/services/action-state";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";

export type HouseholdActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function error(locale: AppLocale, code?: string): Promise<HouseholdActionState> {
  const t = await getTranslations({ locale, namespace: "household.errors" });
  const key = serviceErrorKey(code);
  return {
    status: "error",
    message: t(["denied", "state", "validation"].includes(key) ? key : "generic"),
  };
}

const phoneSchema = z
  .string()
  .trim()
  .regex(/^([0-9+() .-]{7,32})?$/)
  .transform((value) => (value === "" ? null : value));

function revalidateHousehold(locale: AppLocale) {
  revalidatePath(`/${locale}/household`);
  revalidatePath(`/${locale}/dashboard`);
}

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
