import { BookOpen, Check, Languages, MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const services = [
  { key: "rbt", icon: BookOpen },
  { key: "consultation", icon: MessagesSquare },
  { key: "iep", icon: Languages },
] as const;

/**
 * Public service and price summary (PRD section 33). Static copy keeps the
 * marketing site credential-free; launch prices are fixed by the PRD.
 */
export async function ServicesOverview({ showPolicy = false }: { showPolicy?: boolean }) {
  const t = await getTranslations("publicServices");
  return (
    <div className="space-y-6">
      <ul className="grid gap-5 lg:grid-cols-3">
        {services.map(({ key, icon: Icon }) => (
          <li className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm" key={key}>
            <Icon aria-hidden="true" className="size-9 text-link" />
            <h3 className="mt-4 text-xl font-bold">{t(`${key}.name`)}</h3>
            <p className="mt-2 text-2xl font-bold">{t(`${key}.price`)}</p>
            <p className="text-sm font-semibold text-muted-foreground">{t(`${key}.billing`)}</p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{t(`${key}.description`)}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {(t.raw(`${key}.features`) as string[]).map((feature) => (
                <li className="flex gap-2" key={feature}>
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-link" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <Link
                className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                href="/signup"
              >
                {t(`${key}.action`)}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="rounded-xl border border-input bg-tint p-4 text-sm font-semibold">
        {t("independentNotice")}
      </p>
      {showPolicy ? (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border bg-white p-6">
            <h3 className="font-bold">{t("policyTitle")}</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {(t.raw("policy") as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border bg-white p-6">
            <h3 className="font-bold">{t("feesTitle")}</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {(t.raw("fees") as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("certificationDisclaimer")}</p>
    </div>
  );
}
