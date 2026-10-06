import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export type AdminView = "admin" | "member" | "specialist";

const views = [
  ["admin", "/admin"],
  ["member", "/dashboard"],
  ["specialist", "/specialist"],
] as const;

/** Lets an administrator switch between the admin console, the member preview, and the specialist workspace. */
export async function AdminViewSwitcher({ current }: Readonly<{ current: AdminView }>) {
  const t = await getTranslations("adminView");
  return (
    <nav
      aria-label={t("label")}
      className="flex items-center gap-1 rounded-xl border border-border bg-tint p-1"
    >
      {views.map(([view, href]) => (
        <Link
          aria-current={view === current ? "page" : undefined}
          className={
            view === current
              ? "rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              : "rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          }
          href={href}
          key={view}
        >
          {t(view)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The member area as an administrator sees it: a notice plus every form
 * control disabled. Links still work so the preview can be browsed; the
 * database independently refuses household actions by administrators.
 */
export async function MemberPreview({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("adminView");
  return (
    <>
      <div
        className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        role="status"
      >
        <p className="font-semibold">{t("memberPreviewTitle")}</p>
        <p className="mt-1">{t("memberPreviewDescription")}</p>
      </div>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled>
        <legend className="sr-only">{t("memberPreviewTitle")}</legend>
        {children}
      </fieldset>
    </>
  );
}
