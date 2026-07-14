import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";
import type { AppLocale } from "@/i18n/routing";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: localeValue } = await params;
  const locale = localeValue as AppLocale;
  const { next } = await searchParams;
  if (await getAuthenticatedUser()) redirect(getLocaleDashboardPath(locale));
  const t = await getTranslations("authentication");
  const safeNext = getSafeLocaleRedirect(next, getLocaleDashboardPath(locale), locale);
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t("loginTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("loginDescription")}</p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <AuthForm mode="login" locale={locale} next={safeNext} />
      </div>
    </section>
  );
}
