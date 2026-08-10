# Multilingual strategy

## ETH-027 appointment scheduling

ETH-027 adds an aligned English, Amharic, and Spanish `appointments` namespace covering the proposal form, date, time, timezone, duration and modality labels, statuses and audit actions, controlled cancellation reasons, the consent title, copy, reschedule notice and checkbox label, meeting-link guidance, the administrator read-only notice, the access-removed state, and every scheduling error including the daylight-saving and conflict cases. Appointment status is conveyed as text rather than colour, and the confirmed timezone is always shown in words next to the localized date and time. The consent copy is safety-sensitive: English is canonical and versioned through a controlled copy-version identifier, and the Amharic and Spanish wording is an implementation draft requiring native-speaker review before release, especially the non-guarantee sentence. Amharic remains left-to-right, and appointment panels wrap long localized strings rather than fixing dimensions.

## ETH-026 specialist assignment

ETH-026 adds an aligned English, Amharic, and Spanish `specialists` namespace covering the specialist directory, assignment and revocation controls and confirmations, assignment history actions and revocation reasons, assignment status and version labels, the specialist workspace and workload, specialist responses, the access-removed state, the household-controls-lifecycle notice, and every assignment error including the updated-elsewhere conflict. Message author kind is exposed as translated text (`Caregiver` / `Specialist`) rather than colour alone. The ETH-025 administrator notice that previously said assignment was unavailable is replaced in all three locales. A caregiver's stored preferred language is surfaced to the assigned specialist so they can respond appropriately, but no user-authored request or response text is machine-translated. Amharic remains left-to-right, assignment and history layouts wrap long localized strings, and the new Amharic and Spanish wording is an implementation draft requiring native-speaker review before release.

## ETH-025 support requests

ETH-025 adds aligned English, Amharic, and Spanish keys for the support list, filters, request form, categories, preferred languages, statuses, follow-up messaging, close/cancel confirmations, conflict and cap errors, empty/read-only/denied states, the administrator triage queue, and the "specialist assignment is not available yet" notice. The non-emergency disclaimer, expectations copy, household-visibility notice, and acknowledgment label are safety-sensitive: English is canonical and versioned through a controlled copy-version identifier, and the Amharic and Spanish wording is an implementation draft that requires native-speaker review before release — especially the emergency-services sentence. A caregiver's request stores a preferred language for future human support, but user-authored request and message text is never machine-translated. Amharic remains left-to-right, and the request, message, and triage layouts wrap long localized strings rather than fixing dimensions.

## Member resource discovery

The learning hub, filters, topics, resource types, bookmark and roadmap actions, empty states, pagination, and administrator discovery controls have aligned English, Amharic, and Spanish message keys. Resource cards and details use the ETH-024 approved/current requested-locale selection and display the existing localized English-fallback notice when needed. Amharic remains left-to-right. New Amharic and Spanish interface wording requires native-speaker review before release.

## ETH-024 reviewed resources

Resource translations support canonical English plus reviewed Amharic and Spanish. Reader selection is requested locale then English only: missing, stale, draft, and in-review translations display approved English with a localized accessible fallback notice. Amharic remains left-to-right. The added UI strings and published resource content require native Amharic and Spanish review before release.

## ETH-021 roadmap wording

ETH-021 adds aligned English, Amharic, and Spanish roadmap labels, categories, priorities, statuses, validation errors, archive/restore messaging, and read-only states. Long titles, names, descriptions, and translated labels use wrapping layouts; Amharic remains left-to-right. The Amharic and Spanish wording is an implementation draft and requires native-speaker review before release.

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

ETH-023 adds aligned English, Amharic, and Spanish labels for the resource catalog and editorial workflow. Only the approved canonical English (`locale='en'`) resource body is reader-visible in this milestone; locale routing still localizes surrounding controls. ETH-024 is the exclusive owner of translated resource creation, review, fallback, coverage, and native-speaker approval workflows. Amharic remains left-to-right, and the new Amharic and Spanish interface text requires native-speaker review before release.
