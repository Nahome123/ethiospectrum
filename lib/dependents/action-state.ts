export type DependentActionState = { status: "idle" } | { status: "error"; message: string };

export const initialDependentActionState: DependentActionState = { status: "idle" };
