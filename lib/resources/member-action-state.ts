export type MemberResourceActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      message: string;
      bookmarked?: boolean;
      onRoadmap?: boolean;
    };

export const initialMemberResourceActionState: MemberResourceActionState = { status: "idle" };
