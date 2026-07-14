import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const t = await getTranslations("authentication");
  const message =
    reason === "access-denied"
      ? t("accessDenied")
      : reason === "expired"
        ? t("expiredConfirmationLink")
        : t("invalidConfirmationLink");
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <h1 className="text-3xl font-bold">{t("authErrorTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{message}</p>
      <Link href="/login" className="mt-6 inline-block font-semibold text-primary underline">
        {t("backToLogin")}
      </Link>
    </section>
  );
}
