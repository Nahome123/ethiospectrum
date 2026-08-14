import {
  CalendarClock,
  ChevronRight,
  FileText,
  FolderOpen,
  HousePlus,
  Sparkles,
  Upload,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HouseholdEditForm } from "@/components/onboarding/household-edit-form";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getDependentContext } from "@/lib/dependents/server";
import { getDocumentDashboardSummary } from "@/lib/documents/binder-query";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params;
  const locale = localeValue as AppLocale;
  const [t, common, dependentsT, documentsT, onboardingT] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("common"),
    getTranslations("dependents"),
    getTranslations("documents"),
    getTranslations("onboarding"),
  ]);
  const context = await getDependentContext();

  if (!context) {
    return (
      <section className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <HousePlus aria-hidden="true" className="size-9 text-primary" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{onboardingT("title")}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{onboardingT("description")}</p>
          <div className="mt-8">
            <OnboardingForm locale={locale} />
          </div>
        </div>
      </section>
    );
  }

  const supabase = await createServerComponentSupabaseClient();
  const documentSummary = await getDocumentDashboardSummary();
  const dependentResult = context
    ? await supabase
        .from("dependents")
        .select("id, first_name, preferred_name")
        .eq("household_id", context.household.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] as { id: string; first_name: string; preferred_name: string | null }[] };
  const dependentCountResult = context
    ? await supabase
        .from("dependents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", context.household.id)
        .is("archived_at", null)
    : { count: 0 };
  const dependents = dependentResult.data ?? [];
  const dependentCount = dependentCountResult.count ?? 0;
  const documents = documentSummary.recentDocuments;

  const documentAlerts = [
    documentSummary.pendingCount
      ? {
          href: "/documents?uploadStatus=pending",
          label: t("pendingDocumentCount", { count: documentSummary.pendingCount }),
        }
      : null,
    documentSummary.failedCount
      ? {
          href: "/documents?uploadStatus=failed",
          label: t("failedDocumentCount", { count: documentSummary.failedCount }),
        }
      : null,
    documentSummary.processingCount
      ? {
          href: "/documents?processingStatus=processing",
          label: t("processingDocumentCount", { count: documentSummary.processingCount }),
        }
      : null,
    documentSummary.needsOcrCount
      ? {
          href: "/documents?processingStatus=needs_ocr",
          label: t("needsOcrDocumentCount", { count: documentSummary.needsOcrCount }),
        }
      : null,
    documentSummary.processingFailedCount
      ? {
          href: "/documents?processingStatus=failed",
          label: t("processingFailedDocumentCount", { count: documentSummary.processingFailedCount }),
        }
      : null,
  ].filter((alert): alert is NonNullable<typeof alert> => alert !== null);

  return (
    <section className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">{common("sample")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("welcome")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("intro")}</p>
        </div>
        {documentSummary.context?.canUpload ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            href="/documents/upload"
          >
            <Upload aria-hidden="true" size={17} />
            {documentsT("uploadDocument")}
          </Link>
        ) : null}
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <section
          className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="documents-title"
        >
          <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderOpen aria-hidden="true" size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold" id="documents-title">
                  {t("recentDocuments")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("documentCount", { count: documentSummary.activeCount })}
                </p>
              </div>
            </div>
            <Link
              className="inline-flex min-h-10 items-center gap-1 self-start rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              href="/documents"
            >
              {t("manageDocuments")}
              <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-secondary/55 px-4 py-3">
              <dt className="text-xs font-medium text-muted-foreground">{t("activeDocuments")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{documentSummary.activeCount}</dd>
            </div>
            <div className="rounded-2xl bg-secondary/55 px-4 py-3">
              <dt className="text-xs font-medium text-muted-foreground">{t("completedDocuments")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{documentSummary.completedCount}</dd>
            </div>
            <div className="col-span-2 rounded-2xl bg-secondary/55 px-4 py-3 sm:col-span-1">
              <dt className="text-xs font-medium text-muted-foreground">{t("pendingDocuments")}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{documentSummary.pendingCount}</dd>
            </div>
          </dl>

          {documentAlerts.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {documentAlerts.map((alert) => (
                <Link
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  href={alert.href}
                  key={alert.href}
                >
                  {alert.label}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            {documents.length ? (
              <ul className="divide-y divide-border/70">
                {documents.map((document) => (
                  <li key={document.id}>
                    <Link
                      className="group flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                      href={`/documents/${document.id}`}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                        <FileText aria-hidden="true" size={17} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                        {document.title}
                      </span>
                      <ChevronRight aria-hidden="true" className="shrink-0 text-muted-foreground" size={17} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-secondary/40 px-4 py-5 text-sm text-muted-foreground">
                {t("documentsEmpty")}
              </p>
            )}
          </div>
        </section>

        <div className="grid gap-6">
          <section
            className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-6"
            aria-labelledby="family-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-foreground">
                  <UsersRound aria-hidden="true" size={20} />
                </div>
                <h2 className="mt-4 font-heading text-lg font-semibold" id="family-title">
                  {dependentsT("dashboardTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dependentsT("dashboardCount", { count: dependentCount })}
                </p>
              </div>
              <Link
                className="rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                href="/dependents"
              >
                {dependentsT("manage")}
              </Link>
            </div>
            {dependents.length ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {dependents.map((dependent) => {
                  const name = dependent.preferred_name || dependent.first_name;
                  return (
                    <li
                      className="inline-flex items-center gap-2 rounded-full bg-secondary/65 py-1.5 pr-3 pl-1.5 text-sm"
                      key={dependent.id}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      {name}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{dependentsT("emptyDescription")}</p>
            )}
          </section>

          <section
            className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-6"
            aria-labelledby="deadline-title"
          >
            <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
              <CalendarClock aria-hidden="true" size={20} />
            </div>
            <h2 className="mt-4 font-heading text-lg font-semibold" id="deadline-title">
              {t("upcoming")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sampleDeadline")}</p>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <section
          className="rounded-2xl border border-border/70 bg-card/70 p-5"
          aria-labelledby="recommended-title"
        >
          <Sparkles aria-hidden="true" className="text-primary" size={19} />
          <h2 className="mt-3 font-semibold" id="recommended-title">
            {t("recommended")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sampleAction")}</p>
        </section>
        <section
          className="rounded-2xl border border-border/70 bg-card/70 p-5"
          aria-labelledby="assistant-title"
        >
          <FileText aria-hidden="true" className="text-primary" size={19} />
          <h2 className="mt-3 font-semibold" id="assistant-title">
            {t("ask")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{common("sample")}</p>
        </section>
        <section
          className="rounded-2xl border border-border/70 bg-card/70 p-5"
          aria-labelledby="resource-title"
        >
          <FolderOpen aria-hidden="true" className="text-primary" size={19} />
          <h2 className="mt-3 font-semibold" id="resource-title">
            {t("resource")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sampleResource")}</p>
        </section>
      </div>

      {context.canManage ? (
        <section
          aria-labelledby="household-setup-title"
          className="mt-6 rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-6"
        >
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HousePlus aria-hidden="true" size={20} />
          </div>
          <h2 className="mt-4 font-heading text-lg font-semibold" id="household-setup-title">
            {onboardingT("editTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {onboardingT("editDescription")}
          </p>
          <div className="mt-5 max-w-xl">
            <HouseholdEditForm householdName={context.household.name} locale={locale} />
          </div>
        </section>
      ) : null}
    </section>
  );
}
