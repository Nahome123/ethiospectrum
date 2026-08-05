import "server-only";
import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { SupportQueryState } from "./query-state";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];

export type SupportContext = {
  household: { id: string; name: string };
  userId: string;
  permission: HouseholdPermission;
  canCreate: boolean;
};

export type SupportRequest = {
  id: string;
  subject: string;
  category: string;
  preferred_language: string;
  status: string;
  version: number;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  requester_name: string;
  requester_is_self: boolean;
  can_message: boolean;
  can_close: boolean;
  can_cancel: boolean;
  assigned_specialist_name: string | null;
  total_count: number;
};

export type SupportRequestMessage = {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_kind: string;
  author_is_self: boolean;
  author_is_former: boolean;
};

export type AdminSupportRequest = {
  id: string;
  household_label: string;
  subject: string;
  category: string;
  preferred_language: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  assigned_specialist_name: string | null;
  assignment_version: number;
  total_count: number;
};

export async function getSupportContext(): Promise<SupportContext | null> {
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

  return {
    household,
    userId: claims.sub,
    permission: data.permission,
    canCreate: data.permission !== "viewer",
  };
}

/** Returns null on a load failure so pages can distinguish it from an empty result. */
export async function listSupportRequests(query: SupportQueryState): Promise<SupportRequest[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_support_requests", {
    input_status: query.status ?? undefined,
    input_category: query.category ?? undefined,
    input_page: query.page,
    input_request_id: undefined,
  });
  return error || !data ? null : data;
}

export async function getSupportRequest(requestId: string): Promise<SupportRequest | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_support_requests", {
    input_status: undefined,
    input_category: undefined,
    input_page: 1,
    input_request_id: requestId,
  });
  return error || !data?.[0] ? null : data[0];
}

export async function getSupportRequestMessages(requestId: string): Promise<SupportRequestMessage[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_support_request_messages", {
    target_thread_id: requestId,
  });
  return error || !data ? [] : data;
}

/** Returns null on a load failure so pages can distinguish it from an empty result. */
export async function listAdminSupportRequests(
  query: SupportQueryState,
): Promise<AdminSupportRequest[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_support_requests_admin", {
    input_status: query.status ?? undefined,
    input_category: query.category ?? undefined,
    input_page: query.page,
    input_request_id: undefined,
  });
  return error || !data ? null : data;
}

export async function getAdminSupportRequest(requestId: string): Promise<AdminSupportRequest | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_support_requests_admin", {
    input_status: undefined,
    input_category: undefined,
    input_page: 1,
    input_request_id: requestId,
  });
  return error || !data?.[0] ? null : data[0];
}
