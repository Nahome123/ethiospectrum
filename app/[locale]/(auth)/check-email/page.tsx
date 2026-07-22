import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function CheckEmailPage() {
  const t = await getTranslations("authentication");
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <h1 className="text-3xl font-bold">{t("checkEmailTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("checkEmailDescription")}</p>
      <Link
        href="/resend-confirmation"
        className="mt-6 inline-block text-sm font-semibold text-primary underline"
      >
        {t("resendConfirmation")}
      </Link>
    </section>
  );
}
