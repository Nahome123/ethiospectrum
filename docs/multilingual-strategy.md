# Multilingual strategy

Routes always use `/en`, `/am`, or `/es`; `proxy.ts` negotiates routes and the request config falls back to English only for an unsupported request locale internally. Invalid URLs are not silently treated as English pages. Locale-aware `Link` and navigation helpers preserve the selected locale.

`messages/en.json`, `messages/am.json`, and `messages/es.json` have aligned structures. Add keys to all three in one change, then run the translation-completeness test. Amharic uses left-to-right direction and a Noto Sans Ethiopic-first CSS font stack. Avoid fixed-height controls because translations grow.

Native Amharic and Spanish reviewers must approve all sensitive, legal, medical, immigration, and benefit-related content. AI may assist only with non-sensitive draft translation; it cannot independently translate specialized terms or approve final content. To add a locale, update routing, messages, metadata alternates, tests, and reviewer workflow together.

ETH-019 conversation language is stored as `en`, `am`, or `es` when a conversation is created and is never inferred from later messages. The provider receives that stored language for every assistant response, while the selected route locale controls interface text. New chat UI strings, advisory warnings, retry/fallback states, and citation labels are aligned across all three message files. Amharic and Spanish chat wording—including insufficient-evidence and outside-document fallback behavior—requires native-speaker review before release.

The ETH-008 authentication strings in Amharic and Spanish are implementation drafts and require native-speaker review before a public launch. This includes account recovery, confirmation-link, password, access-denied, and terms/privacy wording.

ETH-011 adds aligned dependent-management strings for profile labels, validation, archive confirmation, permission messaging, empty states, and dashboard counts. The Amharic and Spanish implementation drafts require native-speaker review before launch, especially the sensitive notes guidance and archive wording.

The RBT training UI adds aligned English, Amharic, and Spanish control, progress, error, navigation, and educational-notice strings. The supplied lesson itself is a bilingual English/Amharic source artifact and remains intentionally source-faithful; it is not machine-retranslated when a visitor selects Spanish. Native Amharic review must check the supplied lesson terminology and mixed-script source text, while native Spanish review must approve the surrounding application controls and notices before release.

ETH-017 adds aligned English, Amharic, and Spanish Q&A controls, lifecycle status, source labels, limits, and verification notices. Amharic remains left-to-right. The Amharic and Spanish Q&A strings and generated answer terminology are implementation drafts that require native-speaker review before sensitive use or release; the interface states that requirement and does not claim it has happened.

ETH-018 adds aligned English, Amharic, and Spanish quality scores, source-warning, feedback, rating, issue-category, internal-use decision, and verification language. Amharic remains left-to-right and the responsive panels use wrapping grids rather than fixed dimensions. The Amharic and Spanish quality/review strings are implementation drafts requiring native-speaker review before release, especially the internal-use approval disclaimer, safety warnings, rating labels, and issue terminology.

ETH-020 adds aligned English, Amharic, and Spanish citation controls, evidence-sheet labels, unavailable-source copy, partial-document notice, and original-page navigation language. Amharic remains left-to-right and the sheet and controls must wrap at narrow widths and 200% zoom. The Amharic and Spanish wording is an implementation draft requiring native-speaker review before release, especially source-evidence, logical-section, unavailable-source, and verification phrasing.
