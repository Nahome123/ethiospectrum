import { getTranslations } from "next-intl/server";
import { brandConfig } from "@/config/brand";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "./brand-logo";

export async function PublicFooter() {
  const t = await getTranslations();
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Link href="/" aria-label={brandConfig.name} className="inline-block">
            <BrandLogo className="h-10 w-48" />
          </Link>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("footer.description")}</p>
          <p className="mt-3 text-xs text-muted-foreground">{t("footer.draft")}</p>
        </div>
        <nav aria-label={t("footer.description")} className="flex gap-4 text-sm font-medium">
          <Link href="/privacy">{t("navigation.privacy")}</Link>
          <Link href="/terms">{t("navigation.terms")}</Link>
        </nav>
        <p className="text-xs text-muted-foreground lg:col-span-2">
          {t("footer.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
