import { notFound, redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
export default async function ReviewTranslationPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string; translationLocale: string }>;
}) {
  const { locale, resourceId, translationLocale } = await params;
  if (translationLocale !== "am" && translationLocale !== "es") notFound();
  redirect(`/${locale}/editor/resources/${resourceId}/translations/${translationLocale}`);
}
