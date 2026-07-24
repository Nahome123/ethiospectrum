export type DocumentOcrActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialDocumentOcrActionState: DocumentOcrActionState = {
  status: "idle",
  message: "",
};
