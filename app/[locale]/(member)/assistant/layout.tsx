import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredAssistantLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("assistant");
  return children;
}
