import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth/auth-form";
export default async function LoginPage() {
  const t = await getTranslations("authentication");
  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
        {t("notReady")}
      </p>
      <h1 className="mt-4 text-3xl font-bold">{t("loginTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("loginDescription")}</p>
      <div className="mt-8 rounded-xl border border-border bg-white p-6">
        <AuthForm mode="login" />
      </div>
    </section>
  );
}
