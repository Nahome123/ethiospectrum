# Document processing design

Future flow: authenticated browser → signed upload URL → document record → private storage upload → background job → validation and malware scan → page-level extraction → language detection → chunks and embeddings → structured analysis and citations → user notification.

Workers must be idempotent, retryable, observable, permission-aware, duplicate-safe, resumable, and sanitized: no document contents in logs or error telemetry. MVP candidates are searchable/scanned PDF, DOCX, and TXT. OCR and parsing are deliberately not implemented here.
