import type { Session, User } from "@supabase/supabase-js";

export type { Session, User };

export const supabaseRoles = ["member", "specialist", "content_editor", "administrator"] as const;

export type SupabaseRole = (typeof supabaseRoles)[number];

export function getSupabaseRole(user: User): SupabaseRole | null {
  const role = user.app_metadata.role;
  return typeof role === "string" && (supabaseRoles as readonly string[]).includes(role)
    ? (role as SupabaseRole)
    : null;
}

export function userHasSupabaseRole(user: User, role: SupabaseRole): boolean {
  return getSupabaseRole(user) === role;
}
