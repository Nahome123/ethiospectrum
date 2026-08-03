import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import { TranslationTransitionControls } from "@/components/resources/translation-transition-controls";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getEditorTranslation, type TranslationLocale } from "@/lib/resources/translations-server";

function locale(value: string): TranslationLocale | null {
  return value === "am" || value === "es" ? value : null;
}
export const dynamic = "force-dynamic";
export default async function TranslationPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; resourceId: string; translationLocale: string }>;
}) {
  const { locale: appLocale, resourceId, translationLocale: value } = await params;
  const translationLocale = locale(value);
  if (!translationLocale) notFound();
  const [t, result, user] = await Promise.all([
    getTranslations({ locale: appLocale, namespace: "resourceWorkflow" }),
    getEditorTranslation(resourceId, translationLocale),
    getAuthenticatedUser(),
  ]);
  if (!result) notFound();
  const { translation } = result;
  return (
    <>
      <Link className="text-sm underline" href={`/editor/resources/${resourceId}/translations`}>
        {t("resourceTranslations")}
      </Link>
      <header className="mt-6 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {t(translationLocale === "am" ? "amharicTranslation" : "spanishTranslation")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("translationSourceVersion")}: {translation.source_translation_version} ·{" "}
            {t("englishSourceVersion")}: {result.english.version}
          </p>
        </div>
        {translation.review_status === "draft" ? (
          <Link
            className="rounded-md border px-4 py-2 text-sm"
            href={`/editor/resources/${resourceId}/translations/${translationLocale}/edit`}
          >
            {t("editTranslation")}
          </Link>
        ) : null}
      </header>
      {translation.isStale ? (
        <p className="mt-5 rounded-md border border-amber-500 p-3" role="alert">
          {t("translationOutdated")}
        </p>
      ) : null}
      <section className="mt-6 rounded-xl border p-5">
        <TranslationTransitionControls
          locale={appLocale}
          resourceId={resourceId}
          translationLocale={translationLocale}
          translationId={translation.id}
          version={translation.version}
          status={translation.review_status as "draft" | "in_review" | "approved"}
          stale={translation.isStale}
          ownSubmission={translation.submitted_by === user?.id}
        />
      </section>
      <section className="mt-7 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{t("canonicalEnglishSource")}</h2>
        <p className="mt-3 font-medium">{result.english.title}</p>
        <SafeMarkdown body={result.english.body} />
        <h2 className="mt-8 text-xl font-semibold">{t("reviewTranslation")}</h2>
        <p className="mt-3 font-medium">{translation.title}</p>
        <SafeMarkdown body={translation.body} />
      </section>
      <section className="mt-7 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{t("audit")}</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {result.audits.map((audit) => (
            <li key={audit.id}>
              {audit.action} · {audit.created_at}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
