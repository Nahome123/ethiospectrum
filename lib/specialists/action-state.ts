export type SpecialistActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialSpecialistActionState: SpecialistActionState = { status: "idle" };
