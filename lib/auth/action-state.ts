export type AuthActionState =
  | { status: "idle" }
  | { status: "error"; message: string; email?: string }
  | { status: "success"; message: string };

export const initialAuthActionState: AuthActionState = { status: "idle" };
