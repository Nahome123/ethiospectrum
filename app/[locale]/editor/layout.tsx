import type { AppLocale } from "@/i18n/routing";
import { requireResourceEditor } from "@/lib/auth/guards";

export default async function EditorLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  await requireResourceEditor(locale, `/${locale}/editor/resources`);
  return <div className="mx-auto w-full max-w-6xl px-5 py-10">{children}</div>;
}
