import type { AppLocale } from "@/i18n/routing";
import { requireTrainingAccess } from "@/lib/training/server";

/** The bilingual study guide is protected RBT content: an active subscription is required. */
export default async function RbtStudyGuideLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  await requireTrainingAccess(locale as AppLocale);
  return children;
}
