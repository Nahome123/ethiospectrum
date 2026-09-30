import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredAdminResourcesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("resourceHub");
  return children;
}
