import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Session, User };
export type { Database };

export type SupabaseRole = Database["public"]["Enums"]["app_role"];
export type HouseholdSummary = Pick<Database["public"]["Tables"]["households"]["Row"], "id" | "name">;
export type MemberProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "first_name" | "preferred_locale" | "timezone"
>;
