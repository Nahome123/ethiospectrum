export type RoadmapActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialRoadmapActionState: RoadmapActionState = { status: "idle" };
