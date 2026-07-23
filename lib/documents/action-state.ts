export type DocumentActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      documentId: string;
      storagePath: string;
      uploadToken: string;
    }
  | { status: "complete"; documentId: string };

export const initialDocumentActionState: DocumentActionState = { status: "idle" };
