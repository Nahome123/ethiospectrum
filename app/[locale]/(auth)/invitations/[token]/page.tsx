import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { acceptInvitationAction } from "@/lib/households/actions";
import { formatShortDateTime } from "@/lib/services/display";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale: localeParam, token } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "household.invitation" });
  const validToken = /^[0-9a-f]{64}$/.test(token);
  const user = validToken ? await getAuthenticatedUser() : null;

  if (!validToken) {
    return (
      <section className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground" role="alert">
          {t("invalid")}
        </p>
      </section>
    );
  }

  if (!user) {
    const next = `/${locale}/invitations/${token}`;
    return (
      <section className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("signedOutDescription")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href={`/signup?invite=${token}`}
          >
            {t("createAccount")}
          </Link>
          <Link
            className="inline-flex min-h-10 items-center rounded-md border px-4 py-2 font-semibold"
            href={`/login?next=${encodeURIComponent(next)}`}
          >
            {t("signIn")}
          </Link>
        </div>
      </section>
    );
  }

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase.rpc("get_caregiver_invitation", { input_token: token });
  const invitation = data?.[0];

  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      {!invitation || invitation.status !== "pending" ? (
        <p className="mt-3 text-muted-foreground" role="alert">
          {invitation?.status === "accepted" ? t("alreadyAccepted") : t("unavailable")}
        </p>
      ) : (
        <div className="mt-6 space-y-4 rounded-xl border bg-white p-6">
          <p>{t("description", { household: invitation.household_name })}</p>
          <p className="text-sm text-muted-foreground">
            {t("emailNotice", {
              email: invitation.invited_email,
              date: formatShortDateTime(invitation.expires_at, locale),
            })}
          </p>
          <ActionForm
            action={acceptInvitationAction.bind(null, locale, token)}
            pendingLabel={t("accepting")}
            submitLabel={t("accept")}
          />
        </div>
      )}
    </section>
  );
}
