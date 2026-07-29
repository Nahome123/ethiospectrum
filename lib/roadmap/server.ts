import "server-only";
import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { RoadmapQueryState } from "./query-state";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];

export type RoadmapContext = {
  household: { id: string; name: string };
  userId: string;
  permission: HouseholdPermission;
  canCreate: boolean;
  canManageArchived: boolean;
  canReorder: boolean;
};

export type RoadmapItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  dependent_id: string | null;
  dependent_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_is_former: boolean;
  created_by: string;
  can_edit: boolean;
  can_archive: boolean;
  can_restore: boolean;
  can_reorder: boolean;
  total_count: number;
};

export type RoadmapAssignableMember = { user_id: string; display_name: string };
export type RoadmapDependent = { id: string; first_name: string; preferred_name: string | null };

export async function getRoadmapContext(): Promise<RoadmapContext | null> {
  const claims = await getCurrentSupabaseClaims();
  const household = await getCurrentHousehold();
  if (!claims || typeof claims.sub !== "string" || !household) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return null;

  const canManageArchived = data.permission === "owner" || data.permission === "administrator";
  return {
    household,
    userId: claims.sub,
    permission: data.permission,
    canCreate: data.permission !== "viewer",
    canManageArchived,
    canReorder: canManageArchived,
  };
}

export async function getRoadmapAssignableMembers(): Promise<RoadmapAssignableMember[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_roadmap_assignable_members");
  if (error || !data) return [];
  return data;
}

export async function getRoadmapDependents(householdId: string): Promise<RoadmapDependent[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("first_name", { ascending: true })
    .limit(100);
  return error || !data ? [] : data;
}

export async function getRoadmapItems(query: RoadmapQueryState): Promise<RoadmapItem[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_roadmap_items", {
    input_archived: query.archived,
    input_assignee: query.assignee,
    input_status: query.status ?? undefined,
    input_priority: query.priority ?? undefined,
    input_category: query.category ?? undefined,
    input_dependent_id: query.dependent ?? undefined,
    input_overdue: query.overdue,
    input_completed: query.completed,
    input_sort: query.sort,
    input_page: query.page,
    input_item_id: undefined,
  });
  return error || !data ? [] : data;
}

export async function getRoadmapItem(itemId: string): Promise<RoadmapItem | null> {
  const supabase = await createServerComponentSupabaseClient();
  const active = await supabase.rpc("list_roadmap_items", {
    input_archived: false,
    input_assignee: "all",
    input_status: undefined,
    input_priority: undefined,
    input_category: undefined,
    input_dependent_id: undefined,
    input_overdue: false,
    input_completed: false,
    input_sort: "manual",
    input_page: 1,
    input_item_id: itemId,
  });
  if (!active.error && active.data?.[0]) return active.data[0];

  const archived = await supabase.rpc("list_roadmap_items", {
    input_archived: true,
    input_assignee: "all",
    input_status: undefined,
    input_priority: undefined,
    input_category: undefined,
    input_dependent_id: undefined,
    input_overdue: false,
    input_completed: false,
    input_sort: "manual",
    input_page: 1,
    input_item_id: itemId,
  });
  return archived.error || !archived.data?.[0] ? null : archived.data[0];
}
