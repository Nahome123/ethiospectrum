import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { DocumentQuestionStatus } from "@/lib/documents/questions/constants";

function questionStatusPresentation(
  status: DocumentQuestionStatus,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  switch (status) {
    case "queued":
      return { label: t("questionQueued"), variant: "secondary" as const };
    case "answering":
      return { label: t("answeringQuestion"), variant: "secondary" as const };
    case "completed":
      return { label: t("answerCompleted"), variant: "default" as const };
    case "failed":
      return { label: t("answerFailed"), variant: "destructive" as const };
  }
}

/** Displays lifecycle state without exposing worker errors or provider metadata. */
export async function DocumentQuestionStatusBadge({ status }: { status: DocumentQuestionStatus }) {
  const t = await getTranslations("documents");
  const presentation = questionStatusPresentation(status, t);
  return (
    <Badge aria-label={`${t("answerStatus")}: ${presentation.label}`} variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}
