export type BillingActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; url?: string };

export const initialBillingActionState: BillingActionState = { status: "idle" };
