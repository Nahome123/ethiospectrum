/**
 * PRD section 42 demo reconciliation. Features classified RETIRE stay in the
 * codebase (and their data stays intact) but are not exposed: their routes
 * return 404 and their navigation entries are removed. Re-enabling one is a
 * product change request, not a configuration toggle, so these are constants.
 * See docs/demo-reconciliation.md for the full classification.
 */
export const retiredFeatures = {
  /** AI document processing, summaries, OCR, one-turn Q&A, chat, and citations (ETH-014..020). */
  documentAi: false,
  /** "Assistant" placeholder page. */
  assistant: false,
  /** Household roadmap (ETH-021). */
  roadmap: false,
  /** Personal roadmap reminders (ETH-022). */
  reminders: false,
  /** Editorial resource CMS, translations workflow, member resource hub (ETH-023, ETH-024). */
  resourceHub: false,
  /** Free-form support requests, their specialist grant and appointments (ETH-025..027). */
  supportRequests: false,
  /** Public preview of protected RBT content: the PRD allows none without a subscription. */
  publicTrainingPreview: false,
  /** Administrator placeholder pages with no launch function (prompts, documents, audit logs). */
  adminPlaceholders: false,
} as const;

export type RetiredFeature = keyof typeof retiredFeatures;

export function isFeatureEnabled(feature: RetiredFeature): boolean {
  return retiredFeatures[feature];
}
