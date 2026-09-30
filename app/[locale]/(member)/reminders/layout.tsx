import { requireFeature } from "@/lib/features";

/** Retired by the PRD demo reconciliation (config/features.ts). */
export default function RetiredRemindersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  requireFeature("reminders");
  return children;
}
