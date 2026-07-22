import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { hasPasswordRecoveryIntent } from "@/lib/auth/recovery";
import type { AppLocale } from "@/i18n/routing";

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const appLocale = locale as AppLocale;
  if (!(await getAuthenticatedUser()) || !(await hasPasswordRecoveryIntent(appLocale))) {
    redirect(`/${locale}/forgot-password`);
  }
  const t = await getTranslations("authentication");
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t("resetPasswordTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("resetPasswordDescription")}</p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <PasswordRecoveryForm mode="reset" locale={appLocale} />
      </div>
    </section>
  );
}
