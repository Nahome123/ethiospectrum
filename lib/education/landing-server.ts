import "server-only";

import { getServerSupabaseEnv } from "@/lib/env/server";
import { getCurrentHousehold, getCurrentSupabaseClaims } from "@/lib/supabase/server";
import { deriveEducationLandingState, type EducationLandingState } from "./landing-state";

/**
 * Provides only a coarse, server-derived state for public landing-page actions.
 * No household, child, or profile data is rendered into the marketing page.
 */
export async function getEducationLandingState(): Promise<EducationLandingState> {
  if (!getServerSupabaseEnv()) return "visitor";

  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return "visitor";

  const household = await getCurrentHousehold();
  return deriveEducationLandingState({ authenticated: true, hasHousehold: Boolean(household) });
}
