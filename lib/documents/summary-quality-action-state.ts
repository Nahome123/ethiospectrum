export type DocumentSummaryQualityActionState =
  { status: "idle" } | { status: "error"; message: string } | { status: "success"; message: string };

export const initialDocumentSummaryQualityActionState: DocumentSummaryQualityActionState = { status: "idle" };
