import { redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";

export default async function Page({ params }: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  redirect(`/${locale as AppLocale}/dashboard`);
}
