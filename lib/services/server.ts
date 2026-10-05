import "server-only";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { AdminQueue } from "./constants";

type Functions = Database["public"]["Functions"];
type Row<Name extends keyof Functions> = Functions[Name]["Returns"] extends (infer Item)[] ? Item : never;

export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ServiceFee = Database["public"]["Tables"]["service_fees"]["Row"];
export type ConsultationTopic = Database["public"]["Tables"]["consultation_topics"]["Row"];
export type ServiceActivity = Database["public"]["Tables"]["service_request_activities"]["Row"];
export type HouseholdServiceRequest = Row<"list_household_service_requests">;
export type ServiceRequestDetail = Row<"get_service_request_detail">;
export type ServiceAppointment = Row<"list_service_request_appointments">;
export type TimelineItem = Row<"list_service_request_timeline">;
export type ServicePayment = Row<"list_service_request_payments">;
export type ServiceRefund = Row<"list_service_request_refunds">;
export type RequestDocument = Row<"list_service_request_documents">;
export type UpcomingAppointment = Row<"list_upcoming_service_appointments">;
export type SpecialistServiceRequest = Row<"list_specialist_service_requests">;
export type AdminServiceRequest = Row<"admin_list_service_requests">;
export type MatchingSpecialist = Row<"admin_list_matching_specialists">;
export type AdminPayment = Row<"admin_list_service_payments">;
export type AdminRefund = Row<"admin_list_service_refunds">;
export type PaymentHistoryItem = Row<"list_household_payment_history">;

async function client() {
  return createServerComponentSupabaseClient();
}

/** Active services, ordered for the selection page. */
export async function listServices(): Promise<Service[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("service_type", { ascending: false });
  if (error || !data) return [];
  const order = ["rbt_bootcamp", "consultation", "iep_language_assistance"];
  return [...data].sort((a, b) => order.indexOf(a.service_type) - order.indexOf(b.service_type));
}

export async function getService(serviceType: string): Promise<Service | null> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("service_type", serviceType)
    .maybeSingle();
  return error ? null : data;
}

export async function listActiveFees(serviceType: string): Promise<ServiceFee[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("service_fees")
    .select("*")
    .eq("service_type", serviceType)
    .eq("active", true)
    .order("created_at");
  return error || !data ? [] : data;
}

export async function listConsultationTopics(includeInactive = false): Promise<ConsultationTopic[]> {
  const supabase = await client();
  let query = supabase.from("consultation_topics").select("*").order("sort_order").order("topic_key");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  return error || !data ? [] : data;
}

export type DependentOption = { id: string; name: string; preferredLanguage: string | null };

/** Active dependents of the caller's household (RLS scopes the query). */
export async function listDependentOptions(householdId: string): Promise<DependentOption[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("dependents")
    .select("id, first_name, last_name, preferred_name, preferred_language")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("created_at");
  if (error || !data) return [];
  return data.map((dependent) => ({
    id: dependent.id,
    name: [dependent.preferred_name ?? dependent.first_name, dependent.last_name].filter(Boolean).join(" "),
    preferredLanguage: dependent.preferred_language,
  }));
}

export async function listHouseholdServiceRequests(
  status: string | null,
  page: number,
): Promise<HouseholdServiceRequest[] | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_household_service_requests", {
    input_status: status ?? undefined,
    input_page: page,
  });
  return error || !data ? null : data;
}

export async function getServiceRequestDetail(requestId: string): Promise<ServiceRequestDetail | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_service_request_detail", { target_request_id: requestId });
  return error || !data?.[0] ? null : data[0];
}

/** Everything the shared request detail view needs, loaded in parallel. */
/** A family's requested time, as stored by set_requested_schedule. */
export type RequestedSlot = { local_start: string; timezone: string; start_at: string };

export async function getServiceRequestBundle(requestId: string) {
  const supabase = await client();
  const [detail, appointments, timeline, payments, refunds, documents, activities, requestedTimes] =
    await Promise.all([
      supabase.rpc("get_service_request_detail", { target_request_id: requestId }),
      supabase.rpc("list_service_request_appointments", { target_request_id: requestId }),
      supabase.rpc("list_service_request_timeline", { target_request_id: requestId }),
      supabase.rpc("list_service_request_payments", { target_request_id: requestId }),
      supabase.rpc("list_service_request_refunds", { target_request_id: requestId }),
      supabase.rpc("list_service_request_documents", { target_request_id: requestId }),
      supabase
        .from("service_request_activities")
        .select("*")
        .eq("service_request_id", requestId)
        .order("activity_type"),
      supabase
        .from("service_request_requested_times")
        .select("scheduling_mode, slots")
        .eq("service_request_id", requestId)
        .maybeSingle(),
    ]);
  const request = detail.data?.[0];
  if (detail.error || !request) return null;
  return {
    request,
    appointments: appointments.data ?? [],
    timeline: timeline.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    documents: documents.data ?? [],
    activities: activities.data ?? [],
    requestedTimes: requestedTimes.data
      ? {
          mode: requestedTimes.data.scheduling_mode as "direct" | "propose",
          slots: (Array.isArray(requestedTimes.data.slots)
            ? requestedTimes.data.slots
            : []) as RequestedSlot[],
        }
      : null,
  };
}
export type ServiceRequestBundle = NonNullable<Awaited<ReturnType<typeof getServiceRequestBundle>>>;

export async function listUpcomingAppointments(limit = 10): Promise<UpcomingAppointment[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_upcoming_service_appointments", { input_limit: limit });
  return error || !data ? [] : data;
}

export async function listSpecialistServiceRequests(
  scope: "active" | "closed" | "all",
  page: number,
): Promise<SpecialistServiceRequest[] | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_specialist_service_requests", {
    input_scope: scope,
    input_page: page,
  });
  return error || !data ? null : data;
}

export async function listAdminServiceRequests(
  queue: AdminQueue,
  serviceType: string | null,
  page: number,
): Promise<AdminServiceRequest[] | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_list_service_requests", {
    input_queue: queue,
    input_service_type: serviceType ?? undefined,
    input_page: page,
  });
  return error || !data ? null : data;
}

export async function getAdminQueueCounts(): Promise<Record<string, number>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_service_queue_counts");
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.queue, Number(row.item_count)]));
}

export async function listMatchingSpecialists(requestId: string): Promise<MatchingSpecialist[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_list_matching_specialists", {
    target_request_id: requestId,
  });
  return error || !data ? [] : data;
}

export async function listAdminPayments(status: string | null, page: number): Promise<AdminPayment[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_list_service_payments", {
    input_status: status ?? undefined,
    input_page: page,
  });
  return error || !data ? [] : data;
}

export async function listAdminRefunds(status: string | null, page: number): Promise<AdminRefund[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_list_service_refunds", {
    input_status: status ?? undefined,
    input_page: page,
  });
  return error || !data ? [] : data;
}

export async function listHouseholdPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_household_payment_history");
  return error || !data ? [] : data;
}
