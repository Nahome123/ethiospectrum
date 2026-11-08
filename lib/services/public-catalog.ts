import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PublicServiceType = "consultation" | "iep_language_assistance" | "parent_support";

/**
 * Active per-session prices (in cents) from the service catalog, so the
 * marketing pages always match what Checkout charges after an administrator
 * changes a price. Cached for an hour; empty when the database is unreachable
 * (callers then fall back to the translated price text).
 */
export const getPublicServicePrices = unstable_cache(
  async (): Promise<Partial<Record<PublicServiceType, number>>> => {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("services")
        .select("service_type, price_cents")
        .eq("active", true)
        .in("service_type", ["consultation", "iep_language_assistance", "parent_support"]);
      if (error || !data) return {};
      return Object.fromEntries(
        data
          .filter((row) => typeof row.price_cents === "number")
          .map((row) => [row.service_type, row.price_cents as number]),
      );
    } catch {
      return {};
    }
  },
  ["public-service-prices"],
  { revalidate: 3600, tags: ["service-catalog"] },
);
