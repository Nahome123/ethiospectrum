import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { DeleteMemberForm } from "@/components/admin/delete-member-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { deleteMemberAction } from "@/lib/admin/member-actions";
import { getMemberDeletionPreview } from "@/lib/admin/member-deletion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentSupabaseClaims } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const liveStatuses = ["trialing", "active", "past_due", "unpaid", "paused", "incomplete"];

export default async function DeleteMemberPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale: localeParam, userId } = await params;
  const locale = localeParam as AppLocale;
  if (!z.uuid().safeParse(userId).success) notFound();
  const t = await getTranslations({ locale, namespace: "adminConsole.deleteMember" });
  const claims = await getCurrentSupabaseClaims();
  // The admin layout has already required the administrator role.
  const preview = await getMemberDeletionPreview(createSupabaseAdminClient(), userId);
  if (!preview) notFound();

  const blocked =
    preview.userId === claims?.sub
      ? t("errors.self")
      : preview.role === "administrator"
        ? t("errors.administrator")
        : null;
  const household = preview.ownedHousehold;
  const items = household
    ? [
        t("items.household", { name: household.name }),
        t("items.dependents", { count: household.dependents }),
        t("items.requests", { count: household.requests }),
        t("items.payments", { count: household.payments }),
        t("items.documents", { count: household.documents, files: household.files }),
        t("items.billing"),
        t("items.personal"),
      ]
    : [t("items.personal")];
  const warnings = [
    household?.subscriptionStatus && liveStatuses.includes(household.subscriptionStatus)
      ? t("warnings.subscription")
      : null,
    household?.stripeCustomerId ? t("warnings.stripeCustomer") : null,
    household && household.openRefunds > 0 ? t("warnings.refunds", { count: household.openRefunds }) : null,
    household && household.caregivers > 0 ? t("warnings.caregivers", { count: household.caregivers }) : null,
    preview.memberOf.length > 0
      ? t("warnings.caregiverOf", { households: preview.memberOf.join(", ") })
      : null,
    preview.role === "specialist" ? t("warnings.specialist") : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm font-semibold text-link underline" href="/admin/users">
        {t("back")}
      </Link>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-destructive">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold">{t("title", { name: preview.displayName })}</h1>
        <p className="mt-2 text-muted-foreground">{preview.email}</p>
      </div>

      {blocked ? (
        <p className="rounded-xl border border-input bg-tint p-5" role="alert">
          {blocked}
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">{t("whatIsDeleted")}</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">{t("keptNote")}</p>
          </div>

          {warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle aria-hidden="true" className="size-5" />
                {t("beforeYouDelete")}
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border-2 border-destructive/40 bg-card p-6">
            <p className="mb-5 font-semibold text-destructive">{t("permanent")}</p>
            <DeleteMemberForm
              action={deleteMemberAction.bind(null, locale, preview.userId)}
              email={preview.email}
            />
          </div>
        </>
      )}
    </section>
  );
}
