export const DOCUMENT_CITATION_MAX_INDEX = 143;
export const DOCUMENT_CITATION_EXCERPT_MAX_CHARACTERS = 600;

export const DOCUMENT_CITATION_OWNER_TYPES = [
  "document_summary",
  "document_qa_answer",
  "document_chat_message",
] as const;

export const DOCUMENT_CITATION_AVAILABILITY = ["unknown", "available", "unavailable"] as const;

export const DOCUMENT_CITATION_SOURCE_KINDS = ["page", "section"] as const;
