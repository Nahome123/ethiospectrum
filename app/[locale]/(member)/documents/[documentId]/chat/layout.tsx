import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredDocumentChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("documentAi");
  return children;
}
