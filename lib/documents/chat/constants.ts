export const DOCUMENT_CHAT_LANGUAGES = ["en", "am", "es"] as const;

export type DocumentChatLanguage = (typeof DOCUMENT_CHAT_LANGUAGES)[number];

export const DOCUMENT_CHAT_MESSAGE_ROLES = ["user", "assistant"] as const;
export type DocumentChatMessageRole = (typeof DOCUMENT_CHAT_MESSAGE_ROLES)[number];

export const DOCUMENT_CHAT_MESSAGE_STATUSES = ["pending", "generating", "completed", "failed"] as const;
export type DocumentChatMessageStatus = (typeof DOCUMENT_CHAT_MESSAGE_STATUSES)[number];

export const DOCUMENT_CHAT_RESULT_TYPES = [
  "grounded_answer",
  "insufficient_evidence",
  "outside_document",
  "partial_coverage",
] as const;
export type DocumentChatResultType = (typeof DOCUMENT_CHAT_RESULT_TYPES)[number];

export const DOCUMENT_CHAT_PROMPT_VERSION = "document-chat-v1";
export const DOCUMENT_CHAT_MAX_MESSAGE_CHARACTERS = 700;
export const DOCUMENT_CHAT_MAX_ANSWER_CHARACTERS = 1_800;
export const DOCUMENT_CHAT_MAX_SOURCE_REFERENCES = 3;
export const DOCUMENT_CHAT_MAX_HISTORY_MESSAGES = 10;
export const DOCUMENT_CHAT_MAX_SOURCE_CHUNKS = 24;
export const DOCUMENT_CHAT_MAX_SOURCE_CHARACTERS = 24_000;
export const DOCUMENT_CHAT_MAX_PROVIDER_RETRIES = 1;
export const DOCUMENT_CHAT_MAX_PROVIDER_CALLS = DOCUMENT_CHAT_MAX_PROVIDER_RETRIES + 1;
export const DOCUMENT_CHAT_PROVIDER_TIMEOUT_MS = 15_000;
export const DOCUMENT_CHAT_MAX_OUTPUT_TOKENS = 800;
