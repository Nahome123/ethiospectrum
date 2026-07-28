import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { buttonVariants } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";
import { Link } from "@/i18n/navigation";
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
  const t = await getTranslations("authentication");
  const safeNext = getSafeLocaleRedirect(next, getLocaleDashboardPath(locale), locale);
  const adminPath = `/${locale}/admin`;
  const administratorSignIn = safeNext === adminPath;
  const user = await getAuthenticatedUser();
  if (user) {
    redirect(
      administratorSignIn && user.role === "administrator" ? adminPath : getLocaleDashboardPath(locale),
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t(administratorSignIn ? "adminLoginTitle" : "loginTitle")}</h1>
      <p className="mt-3 text-muted-foreground">
        {t(administratorSignIn ? "adminLoginDescription" : "loginDescription")}
      </p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <AuthForm mode="login" locale={locale} next={safeNext} />
      </div>
      {!administratorSignIn && (
        <div className="mt-4 space-y-2">
          <Link
            className={buttonVariants({ className: "min-h-11 w-full", variant: "outline" })}
            href={`/login?next=${encodeURIComponent(adminPath)}`}
          >
            {t("adminLogin")}
          </Link>
          <p className="text-center text-sm text-muted-foreground">{t("adminLoginHint")}</p>
        </div>
      )}
    </section>
  );
}
