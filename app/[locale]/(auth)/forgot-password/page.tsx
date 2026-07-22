import { getTranslations } from "next-intl/server";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import type { AppLocale } from "@/i18n/routing";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("authentication");
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold">{t("forgotPasswordTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("forgotPasswordDescription")}</p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <PasswordRecoveryForm mode="forgot" locale={locale as AppLocale} />
      </div>
    </section>
  );
}
