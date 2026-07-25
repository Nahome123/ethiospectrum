import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

type StatusKind = "upload" | "processing";

function uploadStatusPresentation(status: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  switch (status) {
    case "uploaded":
      return { label: t("statusUploaded"), variant: "default" as const };
    case "failed":
      return { label: t("statusFailed"), variant: "destructive" as const };
    case "archived":
      return { label: t("statusArchived"), variant: "outline" as const };
    default:
      return { label: t("statusPending"), variant: "secondary" as const };
  }
}

function processingStatusPresentation(status: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  switch (status) {
    case "queued":
      return { label: t("processingQueued"), variant: "secondary" as const };
    case "processing":
      return { label: t("processing"), variant: "secondary" as const };
    case "completed":
      return { label: t("processingCompleted"), variant: "default" as const };
    case "failed":
      return { label: t("processingFailed"), variant: "destructive" as const };
    case "unsupported":
      return { label: t("processingUnsupported"), variant: "outline" as const };
    case "needs_ocr":
      return { label: t("ocrScannedRequired"), variant: "outline" as const };
    default:
      return { label: t("notProcessed"), variant: "secondary" as const };
  }
}

export async function DocumentStatusBadge({ kind, status }: { kind: StatusKind; status: string }) {
  const t = await getTranslations("documents");
  const presentation =
    kind === "upload" ? uploadStatusPresentation(status, t) : processingStatusPresentation(status, t);
  const label = kind === "upload" ? t("uploadStatus") : t("processingStatus");

  return (
    <Badge aria-label={`${label}: ${presentation.label}`} variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}
