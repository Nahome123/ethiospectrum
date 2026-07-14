# Multilingual strategy

Routes always use `/en`, `/am`, or `/es`; `proxy.ts` negotiates routes and the request config falls back to English only for an unsupported request locale internally. Invalid URLs are not silently treated as English pages. Locale-aware `Link` and navigation helpers preserve the selected locale.

`messages/en.json`, `messages/am.json`, and `messages/es.json` have aligned structures. Add keys to all three in one change, then run the translation-completeness test. Amharic uses left-to-right direction and a Noto Sans Ethiopic-first CSS font stack. Avoid fixed-height controls because translations grow.

Native Amharic and Spanish reviewers must approve all sensitive, legal, medical, immigration, and benefit-related content. AI may assist only with non-sensitive draft translation; it cannot independently translate specialized terms or approve final content. To add a locale, update routing, messages, metadata alternates, tests, and reviewer workflow together.

The ETH-008 authentication strings in Amharic and Spanish are implementation drafts and require native-speaker review before a public launch. This includes account recovery, confirmation-link, password, access-denied, and terms/privacy wording.
