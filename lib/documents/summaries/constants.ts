export const DOCUMENT_SUMMARY_LANGUAGES = ["en", "am", "es"] as const;

export type DocumentSummaryLanguage = (typeof DOCUMENT_SUMMARY_LANGUAGES)[number];

export const DOCUMENT_SUMMARY_STATUSES = ["queued", "generating", "completed", "failed"] as const;

export type DocumentSummaryStatus = (typeof DOCUMENT_SUMMARY_STATUSES)[number];

export const DOCUMENT_SUMMARY_PROMPT_VERSION = "document-summary-v1";

/** All provider limits are deliberately conservative until production capacity is reviewed. */
export const DOCUMENT_SUMMARY_MAX_SOURCE_CHUNKS = 48;
export const DOCUMENT_SUMMARY_MAX_SOURCE_CHARACTERS = 48_000;
export const DOCUMENT_SUMMARY_MAX_CHUNKS_PER_BATCH = 24;
export const DOCUMENT_SUMMARY_MAX_CHARACTERS_PER_BATCH = 24_000;
export const DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES = 2;
export const DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES = 1;
/** Two source batches plus one final consolidation request. */
export const DOCUMENT_SUMMARY_MAX_PRIMARY_PROVIDER_CALLS = DOCUMENT_SUMMARY_MAX_SOURCE_BATCHES + 1;
/** Every retry is counted as an external provider invocation. */
export const DOCUMENT_SUMMARY_MAX_PROVIDER_CALLS =
  DOCUMENT_SUMMARY_MAX_PRIMARY_PROVIDER_CALLS * (DOCUMENT_SUMMARY_MAX_PROVIDER_RETRIES + 1);
export const DOCUMENT_SUMMARY_PROVIDER_TIMEOUT_MS = 15_000;
export const DOCUMENT_SUMMARY_MAX_OUTPUT_TOKENS = 1_200;

export const DOCUMENT_SUMMARY_MAX_SOURCE_REFERENCES_PER_STATEMENT = 3;
export const DOCUMENT_SUMMARY_MAX_SOURCE_EXCERPT_CHARACTERS = 320;
export const DOCUMENT_SUMMARY_MAX_OVERVIEW_CHARACTERS = 1_600;
export const DOCUMENT_SUMMARY_MAX_STATEMENT_CHARACTERS = 700;
export const DOCUMENT_SUMMARY_MAX_DATE_CHARACTERS = 96;
export const DOCUMENT_SUMMARY_MAX_KEY_POINTS = 8;
export const DOCUMENT_SUMMARY_MAX_IMPORTANT_DATES = 8;
export const DOCUMENT_SUMMARY_MAX_ACTION_ITEMS = 8;
export const DOCUMENT_SUMMARY_MAX_ORGANIZATIONS_OR_PEOPLE = 12;
export const DOCUMENT_SUMMARY_MAX_WARNINGS_OR_UNCERTAINTIES = 8;

export const DOCUMENT_SUMMARY_PROVIDER_ERROR_CODES = [
  "configuration_unavailable",
  "provider_timeout",
  "provider_unavailable",
  "provider_request_rejected",
  "provider_invalid_response",
] as const;

export type DocumentSummaryProviderErrorCode = (typeof DOCUMENT_SUMMARY_PROVIDER_ERROR_CODES)[number];
