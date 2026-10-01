import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { buttonVariants } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath, getSafeLocaleRedirect } from "@/lib/auth/redirects";
import { getRoleHomePath } from "@/lib/auth/role-session";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const { locale: localeValue } = await params;
  const locale = localeValue as AppLocale;
  const { next, notice } = await searchParams;
  const t = await getTranslations("authentication");
  const safeNext = getSafeLocaleRedirect(next, getLocaleDashboardPath(locale), locale);
  const adminPath = `/${locale}/admin`;
  const administratorSignIn = safeNext === adminPath;
  const user = await getAuthenticatedUser();
  if (user) {
    redirect(getRoleHomePath(locale, user.role));
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t(administratorSignIn ? "adminLoginTitle" : "loginTitle")}</h1>
      <p className="mt-3 text-muted-foreground">
        {t(administratorSignIn ? "adminLoginDescription" : "loginDescription")}
      </p>
      {notice === "role-changed" ? (
        <p
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          {t("roleChangedNotice")}
        </p>
      ) : null}
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
