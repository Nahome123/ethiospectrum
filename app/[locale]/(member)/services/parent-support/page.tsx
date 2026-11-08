import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { RequestPageGuard } from "@/components/services/request-page-guard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { requestParentSupportAction } from "@/lib/services/actions";
import { listBookableSpecialists } from "@/lib/services/booking";
import { getService, listDependentOptions } from "@/lib/services/server";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

/**
 * Parent Support: a free session. The family sends a short request; an
 * administrator approves it, and the family then picks a time on the
 * provider's Calendly page from the request.
 */
export default async function ParentSupportRequestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.form" });
  const booking = await getTranslations({ locale, namespace: "services.booking" });
  const languageNames = await getTranslations({ locale, namespace: "services.languages" });
  const [service, specialists, access] = await Promise.all([
    getService("parent_support"),
    listBookableSpecialists("parent_support"),
    getHouseholdAccess(),
  ]);
  const dependents = access ? await listDependentOptions(access.household.id) : [];
  const offered = (["en", "am", "es"] as const).filter((language) =>
    specialists.some((item) => item.languages.includes(language)),
  );
  const languages = offered.length > 0 ? offered : (["en", "am"] as const);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-link underline underline-offset-4" href="/services">
        {t("backToServices")}
      </Link>
      <div>
        <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
          {booking("free")}
        </p>
        <h1 className="mt-3 text-3xl font-bold">{booking("parentSupportTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {booking("parentSupportSummary", { minutes: service?.duration_minutes ?? 30 })}
        </p>
      </div>
      {!access ? (
        <RequestPageGuard reason="household" />
      ) : !access.permissions.includes("submit_requests") ? (
        <RequestPageGuard reason="permission" />
      ) : dependents.length === 0 ? (
        <RequestPageGuard reason="dependents" />
      ) : !service?.active ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground" role="status">
          {booking("noParentSupport")}
        </p>
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <ActionForm
            action={requestParentSupportAction.bind(null, locale)}
            pendingLabel={t("submitting")}
            submitLabel={booking("requestSubmit")}
          >
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ps-dependent">{t("dependent")}</Label>
                <select className={selectClass} id="ps-dependent" name="dependentId" required>
                  {dependents.map((dependent) => (
                    <option key={dependent.id} value={dependent.id}>
                      {dependent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-language">{t("language")}</Label>
                <select
                  className={selectClass}
                  defaultValue={(languages as readonly string[]).includes(locale) ? locale : languages[0]}
                  id="ps-language"
                  name="language"
                >
                  {languages.map((language) => (
                    <option key={language} value={language}>
                      {languageNames(language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-description">{booking("parentSupportTopic")} *</Label>
              <Textarea
                id="ps-description"
                maxLength={2000}
                minLength={10}
                name="description"
                required
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{t("needDescriptionHelp")}</p>
            </div>
            <p className="text-sm text-muted-foreground">{booking("requestNextSteps")}</p>
          </ActionForm>
        </div>
      )}
    </section>
  );
}
