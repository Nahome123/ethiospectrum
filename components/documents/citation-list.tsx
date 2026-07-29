import { getTranslations } from "next-intl/server";
import {
  CitationEvidenceTrigger,
  type CitationEvidenceLabels,
} from "@/components/documents/citation-evidence-trigger";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentCitation } from "@/lib/documents/citations/types";

function evidenceLabels(t: Awaited<ReturnType<typeof getTranslations>>): CitationEvidenceLabels {
  return {
    backToAnswer: t("backToAnswer"),
    citation: t("citation"),
    closeSource: t("closeSource"),
    excerptShortened: t("excerptShortened"),
    loadingSource: t("loadingSource"),
    openOriginalPage: t("openOriginalPage"),
    originalPageNavigationUnavailable: t("originalPageNavigationUnavailable"),
    page: t("page"),
    partialDocument: t("partialDocument"),
    readOnlyEvidence: t("readOnlyEvidence"),
    section: t("section"),
    source: t("source"),
    sourceDetails: t("sourceDetails"),
    sourceEvidence: t("sourceEvidence"),
    sourceExcerpt: t("sourceExcerpt"),
    sourceMayHaveChanged: t("sourceMayHaveChanged"),
    sourceUnavailable: t("sourceUnavailable"),
    tryAgain: t("tryAgain"),
    verifyAgainstOriginal: t("verifyWithOriginalDocument"),
    viewSource: t("viewSource"),
    onlyProcessedContent: t("onlyProcessedContent"),
  };
}

/** Renders compact, keyboard-operable evidence controls near a cited statement. */
export async function CitationList({
  citations,
  className = "mt-3 flex flex-wrap gap-2",
  locale,
}: {
  citations: readonly DocumentCitation[];
  className?: string;
  locale: AppLocale;
}) {
  if (!citations.length) return null;
  const t = await getTranslations({ locale, namespace: "documents" });
  const labels = evidenceLabels(t);

  return (
    <span aria-label={t("citations")} className={className} role="group">
      {citations.map((citation) => (
        <span className="inline-flex" key={`${citation.ownerId}-${citation.citationIndex}`}>
          <CitationEvidenceTrigger citation={citation} labels={labels} locale={locale} />
        </span>
      ))}
    </span>
  );
}
