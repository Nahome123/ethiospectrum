import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredSpecialistSupportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  requireFeature("supportRequests");
  return children;
}
