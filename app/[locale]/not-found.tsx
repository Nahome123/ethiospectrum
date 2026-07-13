import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocalizedNotFound() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="text-4xl font-bold">{t("errors.notFoundTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("errors.notFoundDescription")}</p>
      <Link
        className="mt-7 w-fit rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground"
        href="/"
      >
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
