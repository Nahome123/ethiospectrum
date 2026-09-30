import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredTrainingPreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("publicTrainingPreview");
  return children;
}
