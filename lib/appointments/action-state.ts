export type AppointmentActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialAppointmentActionState: AppointmentActionState = { status: "idle" };
