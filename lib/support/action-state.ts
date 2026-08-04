export type SupportActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialSupportActionState: SupportActionState = { status: "idle" };
