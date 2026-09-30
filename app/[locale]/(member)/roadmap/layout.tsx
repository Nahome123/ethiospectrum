import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredRoadmapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("roadmap");
  return children;
}
