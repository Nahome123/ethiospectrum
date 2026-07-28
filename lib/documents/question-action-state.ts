export type DocumentQuestionActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialDocumentQuestionActionState: DocumentQuestionActionState = { status: "idle" };
