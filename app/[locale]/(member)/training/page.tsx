import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/guards";
import { getCurrentRbtTrainingProgress } from "@/features/training/rbt/server";
import { rbtRouteBySection } from "@/features/training/rbt/constants";

export default async function TrainingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const user = await requireUser(locale, `/${locale}/training`);
  const progress = await getCurrentRbtTrainingProgress(user.id);
  const section = progress.lastSection ?? "overview";
  redirect(`/${locale}/training/rbt/${rbtRouteBySection[section]}`);
}
