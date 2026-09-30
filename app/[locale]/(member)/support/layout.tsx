import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredSupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("supportRequests");
  return children;
}
