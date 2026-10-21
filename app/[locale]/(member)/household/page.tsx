import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { updateHouseholdContactAction } from "@/lib/households/actions";
import { getHouseholdAccess } from "@/lib/households/server";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

/** The household's name and contact details. Each household is one account. */
export default async function HouseholdPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "household" });
  const access = await getHouseholdAccess();
  if (!access) {
    return (
      <section className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground" role="status">
          {t("noHousehold")}
        </p>
      </section>
    );
  }
  const supabase = await createServerComponentSupabaseClient();
  const { data: contact } = await supabase
    .from("households")
    .select("id, name, contact_phone, contact_email, contact_notes")
    .eq("id", access.household.id)
    .maybeSingle();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <section aria-labelledby="household-details" className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold" id="household-details">
          {t("details")}
        </h2>
        {access.isOwner && contact ? (
          <ActionForm
            action={updateHouseholdContactAction.bind(null, locale, contact.id)}
            className="mt-4"
            pendingLabel={t("saving")}
            submitLabel={t("save")}
          >
            <div className="space-y-1.5">
              <Label htmlFor="household-name">{t("name")}</Label>
              <Input defaultValue={contact.name} id="household-name" maxLength={160} name="name" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="household-phone">{t("contactPhone")}</Label>
                <Input
                  defaultValue={contact.contact_phone ?? ""}
                  id="household-phone"
                  name="contactPhone"
                  type="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="household-email">{t("contactEmail")}</Label>
                <Input
                  defaultValue={contact.contact_email ?? ""}
                  id="household-email"
                  name="contactEmail"
                  type="email"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="household-notes">{t("contactNotes")}</Label>
              <Textarea
                defaultValue={contact.contact_notes ?? ""}
                id="household-notes"
                maxLength={1000}
                name="contactNotes"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">{t("contactHelp")}</p>
            </div>
          </ActionForm>
        ) : (
          <dl className="mt-4 text-sm">
            <dt className="font-semibold">{t("name")}</dt>
            <dd className="text-muted-foreground">{access.household.name}</dd>
          </dl>
        )}
      </section>
    </section>
  );
}
