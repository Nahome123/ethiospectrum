import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getLocaleDashboardPath } from "@/lib/auth/redirects";
import type { AppLocale } from "@/i18n/routing";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeValue }, search] = await Promise.all([params, searchParams]);
  const invitation =
    typeof search.invite === "string" && /^[0-9a-f]{64}$/.test(search.invite) ? search.invite : undefined;
  const locale = localeValue as AppLocale;
  if (await getAuthenticatedUser()) redirect(getLocaleDashboardPath(locale));
  const t = await getTranslations("authentication");
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t("signupTitle")}</h1>
      <p className="mt-3 text-muted-foreground">
        {invitation ? t("signupCaregiverDescription") : t("signupDescription")}
      </p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <AuthForm invitation={invitation} locale={locale} mode="signup" />
      </div>
    </section>
  );
}
