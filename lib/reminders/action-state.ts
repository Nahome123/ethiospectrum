export type ReminderActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialReminderActionState: ReminderActionState = { status: "idle" };
