# Accessibility

The foundation targets WCAG 2.2 AA with semantic landmarks, heading order, visible focus styles, skip navigation, keyboard-operable menu and language control, labeled inputs, alert errors, non-color-only labels, and reduced-motion styles. Automated coverage uses axe in Playwright; manual review should cover keyboard-only flows, mobile touch targets, screen readers, zoom/reflow, and mixed Amharic/English text.

Known limitation: native-speaker and assistive-technology testing has not yet been performed. Translation review includes length, terminology, language names, and whether context remains clear when controls expand.

The RBT training route uses a skip link, semantic main content, named section navigation with a current-page state, direct links rather than client-only tabs, visible keyboard focus, native buttons for answer reveal and completion, `aria-expanded`/`aria-controls` on flashcards, labeled glossary search, live progress updates, and an alert when progress cannot be saved. Its source renderer maps only a fixed typed element set and preserves supplied mixed English/Amharic text without injecting HTML. Manual review remains necessary for long bilingual labels, source-script anomalies, zoom/reflow, screen-reader announcements, and touch targets.

The IEP and 504 accommodations guide adds a skip link, landmark-labeled contents, direct section anchors, a text-and-ARIA reading-progress indicator, a native back-to-top button, semantic bilingual tables, visible mobile language labels, and stacked narrow-screen rows. English and Amharic cells declare their language, and the whole guide remains left-to-right. Manual keyboard, screen-reader, 200% zoom, print, and narrow-screen review remains required.
