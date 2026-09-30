"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createServerActionSupabaseClient } from "@/lib/supabase/server-action";
import { expectedVersionSchema, moneyInputSchema, uuidSchema } from "@/lib/validation/services";
import { serviceErrorKey, type ServiceActionState } from "./action-state";
import { deliveryMethodValues, requestableServiceTypes, sessionLanguageValues } from "./constants";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function result(
  locale: AppLocale,
  error: { code?: string } | null,
  successKey: string,
  paths: string[],
): Promise<ServiceActionState> {
  if (error) {
    const t = await getTranslations({ locale, namespace: "services.errors" });
    return { status: "error", message: t(serviceErrorKey(error.code)) };
  }
  for (const path of paths) revalidatePath(`/${locale}${path}`);
  const t = await getTranslations({ locale, namespace: "services.success" });
  return { status: "success", message: t(successKey) };
}

async function invalid(locale: AppLocale): Promise<ServiceActionState> {
  const t = await getTranslations({ locale, namespace: "services.errors" });
  return { status: "error", message: t("validation") };
}

const shortText = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalLocalized = z.string().trim().max(2000);

/** Builds `{am: {...}, es: {...}}`, omitting empty translations (English is canonical). */
function localizedPayload(formData: FormData, fields: readonly string[]) {
  const payload: Record<string, Record<string, string>> = {};
  for (const locale of ["am", "es"] as const) {
    const entry: Record<string, string> = {};
    for (const name of fields) {
      const value = optionalLocalized.safeParse(field(formData, `${locale}.${name}`));
      if (value.success && value.data) entry[name] = value.data;
    }
    if (Object.keys(entry).length > 0) payload[locale] = entry;
  }
  return payload;
}

export async function updateServiceAction(
  locale: AppLocale,
  serviceId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = z
    .object({
      id: uuidSchema,
      version: expectedVersionSchema,
      name: shortText(2, 120),
      description: shortText(2, 2000),
      followUps: z.coerce.number().int().min(0).max(5),
      price: z.union([moneyInputSchema, z.literal("").transform(() => null)]),
    })
    .safeParse({
      id: serviceId,
      version: field(formData, "expectedVersion"),
      name: field(formData, "name"),
      description: field(formData, "description"),
      followUps: field(formData, "includedFollowUps") || "0",
      price: field(formData, "price"),
    });
  if (!parsed.success) return invalid(locale);
  const instructions: Record<string, string> = {};
  for (const language of ["en", "am", "es"] as const) {
    const value = field(formData, `instructions.${language}`).trim().slice(0, 1000);
    if (value) instructions[language] = value;
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_update_service", {
    target_service_id: parsed.data.id,
    expected_version: parsed.data.version,
    input_name: parsed.data.name,
    input_description: parsed.data.description,
    input_localized: localizedPayload(formData, ["name", "description"]),
    input_included_follow_ups: parsed.data.followUps,
    input_standard_instructions: instructions,
    input_active: field(formData, "active") === "on",
    input_price_cents: parsed.data.price ?? undefined,
  });
  return result(locale, error, "serviceUpdated", ["/admin/services", "/services", "/pricing"]);
}

export async function saveServiceFeeAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = z
    .object({
      feeId: z.union([uuidSchema, z.literal("").transform(() => null)]),
      serviceType: z.enum(requestableServiceTypes),
      name: shortText(2, 120),
      description: shortText(2, 1000),
      amount: moneyInputSchema.refine((cents) => cents > 0),
    })
    .safeParse({
      feeId: field(formData, "feeId"),
      serviceType: field(formData, "serviceType"),
      name: field(formData, "name"),
      description: field(formData, "description"),
      amount: field(formData, "amount"),
    });
  if (!parsed.success) return invalid(locale);
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_save_service_fee", {
    input_service_type: parsed.data.serviceType,
    input_name: parsed.data.name,
    input_description: parsed.data.description,
    input_amount_cents: parsed.data.amount,
    input_active: field(formData, "active") === "on",
    target_fee_id: parsed.data.feeId ?? undefined,
  });
  return result(locale, error, "feeSaved", ["/admin/services"]);
}

export async function saveConsultationTopicAction(
  locale: AppLocale,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = z
    .object({
      topicId: z.union([uuidSchema, z.literal("").transform(() => null)]),
      key: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{1,62}$/),
      category: z.enum(["general_guidance", "behavioral_educational"]),
      en: shortText(2, 120),
      am: z.string().trim().max(120),
      es: z.string().trim().max(120),
      sortOrder: z.coerce.number().int().min(0).max(10000),
    })
    .safeParse({
      topicId: field(formData, "topicId"),
      key: field(formData, "topicKey"),
      category: field(formData, "category"),
      en: field(formData, "label.en"),
      am: field(formData, "label.am"),
      es: field(formData, "label.es"),
      sortOrder: field(formData, "sortOrder") || "100",
    });
  if (!parsed.success) return invalid(locale);
  const labels: Record<string, string> = { en: parsed.data.en };
  if (parsed.data.am) labels.am = parsed.data.am;
  if (parsed.data.es) labels.es = parsed.data.es;
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_save_consultation_topic", {
    input_topic_key: parsed.data.key,
    input_category: parsed.data.category,
    input_labels: labels,
    input_sort_order: parsed.data.sortOrder,
    input_active: field(formData, "active") === "on",
    target_topic_id: parsed.data.topicId ?? undefined,
  });
  return result(locale, error, "topicSaved", ["/admin/services"]);
}

const capabilitySchema = z.object({
  service_type: z.enum(requestableServiceTypes),
  language: z.enum(sessionLanguageValues),
  delivery_method: z.enum(deliveryMethodValues),
});

export async function updateSpecialistAction(
  locale: AppLocale,
  specialistId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  // Capabilities arrive as checkbox values "service_type:language:delivery_method".
  const capabilities = formData
    .getAll("capabilities")
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      const [service_type, language, delivery_method] = value.split(":");
      return capabilitySchema.safeParse({ service_type, language, delivery_method });
    });
  const availability = z.enum(["available", "unavailable"]).safeParse(field(formData, "availability"));
  const bio = z.string().trim().max(2000).safeParse(field(formData, "bio"));
  if (
    !uuidSchema.safeParse(specialistId).success ||
    !availability.success ||
    !bio.success ||
    capabilities.some((entry) => !entry.success) ||
    capabilities.length > 24
  ) {
    return invalid(locale);
  }
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_update_specialist", {
    target_specialist_id: specialistId,
    input_availability_status: availability.data,
    input_capabilities: capabilities.flatMap((entry) => (entry.success ? [entry.data] : [])),
    input_bio: bio.data || undefined,
  });
  return result(locale, error, "specialistUpdated", ["/admin/specialists"]);
}

export async function setUserRoleAction(
  locale: AppLocale,
  userId: string,
  _state: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const role = z.enum(["member", "specialist", "administrator"]).safeParse(field(formData, "role"));
  if (!uuidSchema.safeParse(userId).success || !role.success) return invalid(locale);
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    target_user_id: userId,
    input_role: role.data,
  });
  return result(locale, error, "roleUpdated", ["/admin/users", "/admin/specialists"]);
}
