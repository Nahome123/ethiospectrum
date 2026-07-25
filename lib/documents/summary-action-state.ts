export type DocumentSummaryActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialDocumentSummaryActionState: DocumentSummaryActionState = { status: "idle" };
