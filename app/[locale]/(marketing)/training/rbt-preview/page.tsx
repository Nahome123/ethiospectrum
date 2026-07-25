import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";

export default async function RbtTrainingPreviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  redirect(`/${locale}/training/rbt-preview/overview`);
}
