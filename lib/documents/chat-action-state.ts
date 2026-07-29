export type DocumentChatActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; conversationId?: string };

export const initialDocumentChatActionState: DocumentChatActionState = { status: "idle" };
