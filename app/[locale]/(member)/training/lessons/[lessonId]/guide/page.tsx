import { getTranslations } from "next-intl/server";
import { BilingualGuide, LessonHero } from "@/components/training/lesson-study-guide";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  getLessonDetail,
  getTrainingOutline,
  localizedField,
  requireTrainingAccess,
} from "@/lib/training/server";
import { uuidSchema } from "@/lib/validation/services";

/** A lesson's English / Amharic study guide, laid out like the module 2.1 guide. */
export default async function LessonGuidePage({
  params,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
}) {
  const { locale: localeParam, lessonId } = await params;
  const locale = localeParam as AppLocale;
  await requireTrainingAccess(locale);
  const t = await getTranslations({ locale, namespace: "bootcamp" });
  const detail = uuidSchema.safeParse(lessonId).success ? await getLessonDetail(lessonId) : null;
  const backLink = (
    <Link
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
      href="/training"
    >
      ← {t("backToLibrary")}
    </Link>
  );
  if (!detail || !detail.lesson.body) {
    return (
      <section className="mx-auto max-w-3xl space-y-3">
        <p role="alert">{t("lessonUnavailable")}</p>
        {backLink}
      </section>
    );
  }

  const { lesson } = detail;
  const row = (await getTrainingOutline({ type: "member" })).find((item) => item.lesson_id === lesson.id);
  const amharic = (field: string, fallback: string | null) =>
    localizedField(lesson.localized, "am", field, null) ?? fallback;
  const moduleBadge = row
    ? [row.module_title, localizedField(row.module_localized, "am", "title", null)]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <article className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap gap-2">
        {backLink}
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
          href={`/training/lessons/${lesson.id}`}
        >
          {t("backToLesson")}
        </Link>
      </div>
      <LessonHero
        badge={moduleBadge}
        description={amharic("title", null)}
        note={lesson.description ?? undefined}
        title={lesson.title}
      />
      <BilingualGuide
        amharic={amharic("body", null)}
        amharicMissing={t("amharicMissing")}
        english={lesson.body ?? ""}
        title={lesson.title}
        titleAmharic={amharic("title", lesson.title) ?? lesson.title}
      />
      <p className="text-xs text-muted-foreground">{t("certificationDisclaimer")}</p>
    </article>
  );
}
