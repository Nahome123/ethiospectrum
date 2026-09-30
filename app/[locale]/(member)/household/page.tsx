import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import {
  inviteCaregiverAction,
  removeCaregiverAction,
  revokeInvitationAction,
  updateCaregiverPermissionsAction,
  updateHouseholdContactAction,
} from "@/lib/households/actions";
import { caregiverPermissionValues, defaultCaregiverPermissions } from "@/lib/households/caregivers";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatShortDateTime } from "@/lib/services/display";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

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
  const [people, household, invitations] = await Promise.all([
    supabase.rpc("list_household_people"),
    supabase
      .from("households")
      .select("id, name, contact_phone, contact_email, contact_notes")
      .eq("id", access.household.id)
      .maybeSingle(),
    access.isOwner
      ? supabase
          .from("household_invitations")
          .select("id, email, caregiver_permissions, status, expires_at, created_at")
          .eq("household_id", access.household.id)
          .eq("status", "pending")
      : Promise.resolve({
          data: [] as {
            id: string;
            email: string;
            caregiver_permissions: string[];
            status: string;
            expires_at: string;
            created_at: string;
          }[],
        }),
  ]);
  const members = people.data ?? [];
  const caregiver = members.find((person) => person.permission !== "owner");
  const pending = (invitations.data ?? []).filter(
    (invitation) => new Date(invitation.expires_at) > new Date(),
  );
  const contact = household.data;

  const permissionCheckboxes = (selected: readonly string[], prefix: string) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t("permissionsLegend")}</legend>
      {caregiverPermissionValues.map((permission) => (
        <label className="flex items-start gap-2 text-sm" key={`${prefix}-${permission}`}>
          <input
            className="mt-1 size-4"
            defaultChecked={selected.includes(permission)}
            name="permissions"
            type="checkbox"
            value={permission}
          />
          <span>
            <span className="font-medium">{t(`permissions.${permission}.label`)}</span>
            <span className="block text-muted-foreground">{t(`permissions.${permission}.help`)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

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
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">{t("name")}</dt>
              <dd className="text-muted-foreground">{access.household.name}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t("yourRole")}</dt>
              <dd className="text-muted-foreground">{t("caregiver")}</dd>
            </div>
          </dl>
        )}
      </section>

      <section aria-labelledby="household-people" className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold" id="household-people">
          {t("people")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("peopleHelp")}</p>
        <ul className="mt-4 space-y-4">
          {members.map((person) => (
            <li className="rounded-xl border p-4" key={person.member_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {person.display_name}
                  {person.is_self ? ` (${t("you")})` : ""}
                </p>
                <StatusPill
                  label={person.permission === "owner" ? t("owner") : t("caregiver")}
                  tone={person.permission === "owner" ? "info" : "neutral"}
                />
              </div>
              {person.permission !== "owner" && access.isOwner ? (
                <div className="mt-4 space-y-4">
                  <ActionForm
                    action={updateCaregiverPermissionsAction.bind(null, locale, person.member_id)}
                    pendingLabel={t("saving")}
                    submitLabel={t("savePermissions")}
                    variant="outline"
                  >
                    {permissionCheckboxes(person.caregiver_permissions ?? [], person.member_id)}
                  </ActionForm>
                  <ActionForm
                    action={removeCaregiverAction.bind(null, locale, person.member_id)}
                    confirmMessage={t("removeConfirm")}
                    pendingLabel={t("saving")}
                    submitLabel={t("removeCaregiver")}
                    variant="destructive"
                  />
                </div>
              ) : person.permission !== "owner" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {(person.caregiver_permissions ?? [])
                    .map((permission) => t(`permissions.${permission}.label`))
                    .join(" · ") || t("noPermissions")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {access.isOwner ? (
        <section aria-labelledby="household-invite" className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-bold" id="household-invite">
            {t("inviteTitle")}
          </h2>
          {caregiver ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("caregiverLimit")}</p>
          ) : pending.length > 0 ? (
            pending.map((invitation) => (
              <div className="mt-3 space-y-3" key={invitation.id}>
                <p className="text-sm">
                  {t("pendingInvitation", {
                    email: invitation.email,
                    date: formatShortDateTime(invitation.expires_at, locale),
                  })}
                </p>
                <ActionForm
                  action={revokeInvitationAction.bind(null, locale, invitation.id)}
                  confirmMessage={t("revokeConfirm")}
                  pendingLabel={t("saving")}
                  submitLabel={t("revokeInvitation")}
                  variant="outline"
                />
              </div>
            ))
          ) : (
            <ActionForm
              action={inviteCaregiverAction.bind(null, locale)}
              className="mt-4"
              pendingLabel={t("sending")}
              submitLabel={t("sendInvite")}
            >
              <p className="text-sm text-muted-foreground">{t("inviteHelp")}</p>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">{t("caregiverEmail")}</Label>
                <Input autoComplete="off" id="invite-email" name="email" required type="email" />
              </div>
              {permissionCheckboxes(defaultCaregiverPermissions, "invite")}
            </ActionForm>
          )}
        </section>
      ) : null}
    </section>
  );
}
