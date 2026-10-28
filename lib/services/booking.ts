import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

/** Services a family books by picking an open time (consultation, Parent Support). */
export const selfScheduledServiceTypes = ["consultation", "parent_support"] as const;
export type SelfScheduledServiceType = (typeof selfScheduledServiceTypes)[number];

export type BookableSpecialist = { id: string; name: string; bio: string | null; languages: string[] };
export type OpenSlot = { specialistId: string; startAt: string; endAt: string };

export async function listBookableSpecialists(
  serviceType: SelfScheduledServiceType,
): Promise<BookableSpecialist[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_bookable_specialists", {
    input_service_type: serviceType,
  });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.specialist_id,
    name: row.display_name,
    bio: row.bio,
    languages: row.languages ?? [],
  }));
}

export async function listOpenSlots(
  serviceType: SelfScheduledServiceType,
  language: string | null,
  specialistId: string | null,
): Promise<OpenSlot[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_open_service_slots", {
    input_service_type: serviceType,
    input_language: language ?? undefined,
    input_specialist_id: specialistId ?? undefined,
    input_days: 21,
  });
  if (error || !data) return [];
  return data.map((row) => ({ specialistId: row.specialist_id, startAt: row.start_at, endAt: row.end_at }));
}

/**
 * Self-scheduled services at least one specialist offers right now. A service
 * nobody offers (for example Parent Support before its specialist is set up)
 * is hidden everywhere. Cached briefly; empty when the database is unreachable.
 */
export const getOfferedSelfScheduledServices = unstable_cache(
  async (): Promise<SelfScheduledServiceType[]> => {
    try {
      const { data, error } = await createSupabaseAdminClient().rpc("offered_self_scheduled_services");
      if (error || !data) return [];
      return data.filter((type): type is SelfScheduledServiceType =>
        (selfScheduledServiceTypes as readonly string[]).includes(type),
      );
    } catch {
      return [];
    }
  },
  ["offered-self-scheduled-services"],
  { revalidate: 300, tags: ["service-catalog"] },
);
