import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { DocumentSummaryStatus } from "@/lib/documents/summaries/constants";

function summaryStatusPresentation(
  status: DocumentSummaryStatus | null,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (status === null) return { label: t("noSummary"), variant: "outline" as const };

  switch (status) {
    case "queued":
      return { label: t("summaryQueued"), variant: "secondary" as const };
    case "generating":
      return { label: t("generatingSummary"), variant: "secondary" as const };
    case "completed":
      return { label: t("summaryCompleted"), variant: "default" as const };
    case "failed":
      return { label: t("summaryFailed"), variant: "destructive" as const };
  }
}

/** Displays only a summary lifecycle status; it never receives summary content. */
export async function DocumentSummaryStatusBadge({ status }: { status: DocumentSummaryStatus | null }) {
  const t = await getTranslations("documents");
  const presentation = summaryStatusPresentation(status, t);

  return (
    <Badge aria-label={`${t("summaryStatus")}: ${presentation.label}`} variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}
