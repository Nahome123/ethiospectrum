export type ResourceActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialResourceActionState: ResourceActionState = { status: "idle" };
