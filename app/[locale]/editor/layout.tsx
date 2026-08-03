import type { AppLocale } from "@/i18n/routing";
import { requireContentEditor } from "@/lib/auth/guards";

export default async function EditorLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  await requireContentEditor(locale, `/${locale}/editor`);
  return <main className="mx-auto w-full max-w-6xl px-5 py-10">{children}</main>;
}
