import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredAdminAuditLogsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("adminPlaceholders");
  return children;
}
