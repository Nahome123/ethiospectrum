export type DocumentProcessingActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialDocumentProcessingActionState: DocumentProcessingActionState = { status: "idle" };
