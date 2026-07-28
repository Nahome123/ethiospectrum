export const DOCUMENT_QUESTION_LANGUAGES = ["en", "am", "es"] as const;

export type DocumentQuestionLanguage = (typeof DOCUMENT_QUESTION_LANGUAGES)[number];

export const DOCUMENT_QUESTION_STATUSES = ["queued", "answering", "completed", "failed"] as const;

export type DocumentQuestionStatus = (typeof DOCUMENT_QUESTION_STATUSES)[number];

export const DOCUMENT_QUESTION_PROMPT_VERSION = "document-question-v1";

/** Deliberately smaller than summary input: one question gets one bounded call. */
export const DOCUMENT_QUESTION_MAX_SOURCE_CHUNKS = 24;
export const DOCUMENT_QUESTION_MAX_SOURCE_CHARACTERS = 24_000;
export const DOCUMENT_QUESTION_MAX_PROVIDER_RETRIES = 1;
export const DOCUMENT_QUESTION_MAX_PROVIDER_CALLS = DOCUMENT_QUESTION_MAX_PROVIDER_RETRIES + 1;
export const DOCUMENT_QUESTION_PROVIDER_TIMEOUT_MS = 15_000;
export const DOCUMENT_QUESTION_MAX_OUTPUT_TOKENS = 800;
export const DOCUMENT_QUESTION_MAX_CHARACTERS = 700;
export const DOCUMENT_QUESTION_MAX_ANSWER_CHARACTERS = 1_800;
export const DOCUMENT_QUESTION_MAX_SOURCE_REFERENCES = 3;
export const DOCUMENT_QUESTION_MAX_SOURCE_EXCERPT_CHARACTERS = 320;
