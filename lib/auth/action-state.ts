export type AuthActionState =
  | { status: "idle" }
  | { status: "error"; message: string; email?: string; reason?: "email_confirmation_required" }
  | { status: "success"; message: string };

export const initialAuthActionState: AuthActionState = { status: "idle" };
