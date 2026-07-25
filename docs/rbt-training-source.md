# RBT training source provenance

## Supplied source

The supplied RBT / Errorless Teaching bilingual training HTML is archived at `docs/source-artifacts/rbt-errorless-teaching-original.html`. It names Hopebridge and Nebraska ASD Network in the supplied visible attribution. The archive is a provenance record, not a served application page: its original inline styles and `showTab` script are never loaded, fetched, framed, injected, or executed by Ethiospectrum.

The runtime lesson is a typed, static representation in `features/training/rbt/content.ts`, rendered through a fixed React element mapping. The source-body integrity unit test compares the archived visible body text—excluding comments and script—to the ordered runtime source tree, including hero, navigation, all seven sections, and footer. This keeps the provided wording, bilingual text, ordering, flashcards, glossary, and attribution available without allowing arbitrary HTML execution.

## Route mapping

| Supplied section | Ethiospectrum route                       |
| ---------------- | ----------------------------------------- |
| Overview         | `/[locale]/training/rbt/overview`         |
| Procedure        | `/[locale]/training/rbt/procedure`        |
| Error Correction | `/[locale]/training/rbt/error-correction` |
| Setup            | `/[locale]/training/rbt/setup`            |
| Flashcards       | `/[locale]/training/rbt/flashcards`       |
| Glossary         | `/[locale]/training/rbt/glossary`         |
| Takeaways        | `/[locale]/training/rbt/takeaways`        |

The route UI adds accessible controls and an educational-notice boundary; it does not rewrite or silently correct supplied instructional text. Review findings, translation concerns, clinical-content concerns, and attribution/licensing confirmation are tracked in [rbt-training-content-review.md](rbt-training-content-review.md).
