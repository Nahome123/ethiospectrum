import "server-only";
import { createServerComponentSupabaseClient, getCurrentSupabaseClaims } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/supabase/server";

export type AssignableSpecialist = {
  id: string;
  display_name: string;
  languages: string[];
  specialties: string[];
  availability_status: string;
  active_assignment_count: number;
  is_eligible: boolean;
};

export type SupportRequestAssignment = {
  thread_id: string;
  specialist_id: string | null;
  specialist_name: string | null;
  assignment_version: number;
  specialist_assigned_at: string | null;
  status: string;
  can_assign: boolean;
  can_revoke: boolean;
};

export type SupportAssignmentEvent = {
  id: string;
  action: string;
  specialist_name: string;
  assignment_version: number;
  reason: string | null;
  created_at: string;
};

export type SpecialistSupportRequest = {
  id: string;
  subject: string;
  category: string;
  preferred_language: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  total_count: number;
};

export type SpecialistSupportRequestDetail = {
  id: string;
  subject: string;
  category: string;
  preferred_language: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  requester_name: string;
  message_count: number;
};

/** Confirms the caller holds the global specialist role before rendering. */
export async function getCurrentSpecialistUser(): Promise<{ id: string } | null> {
  const claims = await getCurrentSupabaseClaims();
  if (!claims || typeof claims.sub !== "string") return null;
  const role = await getCurrentUserRole(claims.sub);
  return role === "specialist" ? { id: claims.sub } : null;
}

/** Returns null on a load failure so pages can distinguish it from empty data. */
export async function listAssignableSpecialists(): Promise<AssignableSpecialist[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_assignable_specialists");
  return error || !data ? null : data;
}

export async function getSupportRequestAssignment(
  requestId: string,
): Promise<SupportRequestAssignment | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_support_request_assignment", {
    target_thread_id: requestId,
  });
  return error || !data?.[0] ? null : data[0];
}

export async function listSupportRequestAssignmentEvents(
  requestId: string,
): Promise<SupportAssignmentEvent[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_support_request_assignment_events", {
    target_thread_id: requestId,
  });
  return error || !data ? [] : data;
}

export async function listSpecialistSupportRequests(
  page: number,
): Promise<SpecialistSupportRequest[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_specialist_support_requests", {
    input_page: page,
  });
  return error || !data ? null : data;
}

export async function getSpecialistSupportRequest(
  requestId: string,
): Promise<SpecialistSupportRequestDetail | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_specialist_support_request", {
    target_thread_id: requestId,
  });
  return error || !data?.[0] ? null : data[0];
}
