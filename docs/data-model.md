# Data model

The initial migration models profiles, households and members, dependents, documents and page/chunk/analysis derivatives, conversations and messages, roadmaps and reminders, published resources and translations, specialists and support, appointments, consents, and audit logs. UUIDs, foreign keys, timestamps, checks, and scoped indexes are used throughout.

Documents are soft-deleted. Document pages, chunks, embeddings, and analyses derive access from their parent document, so a user denied the document is denied every derivative. `vector(1536)` is a planned embedding storage shape; dimension must be reviewed alongside the chosen model.
