import "server-only";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export type SupportAppointment = {
  id: string;
  status: string;
  version: number;
  start_time: string;
  timezone: string;
  duration_minutes: number;
  modality: string;
  meeting_url: string | null;
  specialist_name: string;
  consented_at: string | null;
  cancellation_reason: string | null;
  can_accept: boolean;
  can_decline: boolean;
  can_cancel: boolean;
  can_complete: boolean;
  can_propose: boolean;
};

export type AppointmentEvent = {
  id: string;
  action: string;
  reason: string | null;
  appointment_version: number;
  created_at: string;
};

/** Returns null on a load failure so pages distinguish it from "no appointment". */
export async function getSupportAppointments(requestId: string): Promise<SupportAppointment[] | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("get_support_appointment", {
    target_thread_id: requestId,
  });
  return error || !data ? null : data;
}

/** The live proposal or scheduled appointment, when one exists. */
export function findLiveAppointment(appointments: SupportAppointment[] | null): SupportAppointment | null {
  if (!appointments) return null;
  return (
    appointments.find(
      (appointment) => appointment.status === "proposed" || appointment.status === "scheduled",
    ) ?? null
  );
}

/**
 * What to display: the live appointment if there is one, otherwise the most
 * recent terminal one, so a household still sees that an appointment was
 * cancelled or declined and why. The read function orders newest first.
 */
export function findDisplayAppointment(appointments: SupportAppointment[] | null): SupportAppointment | null {
  if (!appointments || appointments.length === 0) return null;
  return findLiveAppointment(appointments) ?? appointments[0];
}

export async function listAppointmentEvents(appointmentId: string): Promise<AppointmentEvent[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("list_appointment_events", {
    target_appointment_id: appointmentId,
  });
  return error || !data ? [] : data;
}
