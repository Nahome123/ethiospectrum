import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Explains why a request form cannot be shown, with the next useful action. */
export async function RequestPageGuard({ reason }: { reason: "household" | "permission" | "dependents" }) {
  const t = await getTranslations("services.form");
  return (
    <div className="rounded-2xl border bg-white p-6" role="status">
      <h2 className="text-lg font-bold">{t(`guard.${reason}.title`)}</h2>
      <p className="mt-2 text-muted-foreground">{t(`guard.${reason}.description`)}</p>
      {reason === "dependents" ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          href="/dependents/new"
        >
          {t("guard.dependents.action")}
        </Link>
      ) : reason === "household" ? (
        <Link className="mt-4 inline-block text-sm font-semibold underline" href="/dashboard">
          {t("guard.household.action")}
        </Link>
      ) : null}
    </div>
  );
}
