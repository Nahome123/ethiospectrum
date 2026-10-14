import { getTranslations } from "next-intl/server";
import { LessonPlayer } from "@/components/training/lesson-player";
import {
  LessonBody,
  LessonHero,
  LessonModuleNav,
  LessonResource,
} from "@/components/training/lesson-study-guide";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { listDependentOptions } from "@/lib/services/server";
import { markLessonCompleteAction, resetLessonProgressAction } from "@/lib/training/actions";
import {
  getLessonDetail,
  getTrainingOutline,
  localizedField,
  parseLearner,
  requireTrainingAccess,
} from "@/lib/training/server";
import { uuidSchema } from "@/lib/validation/services";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam, lessonId }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  await requireTrainingAccess(locale);
  const t = await getTranslations({ locale, namespace: "bootcamp" });
  const detail = uuidSchema.safeParse(lessonId).success ? await getLessonDetail(lessonId) : null;
  if (!detail) {
    return (
      <section className="mx-auto max-w-3xl">
        <p role="alert">{t("lessonUnavailable")}</p>
        <Link className="mt-3 inline-block font-semibold underline" href="/training">
          {t("backToLibrary")}
        </Link>
      </section>
    );
  }

  const household = await getHouseholdAccess();
  const dependents = household ? await listDependentOptions(household.household.id) : [];
  const requested = parseLearner(search.learner);
  const learner =
    requested.type === "dependent" && dependents.some((item) => item.id === requested.dependentId)
      ? requested
      : ({ type: "member" } as const);
  const learnerParam = learner.type === "dependent" ? learner.dependentId : "member";
  const learnerName =
    learner.type === "dependent" ? dependents.find((item) => item.id === learner.dependentId)?.name : t("me");
  const outline = await getTrainingOutline(learner);
  const index = outline.findIndex((row) => row.lesson_id === lessonId);
  const current = outline[index];
  const previous = index > 0 ? outline[index - 1] : null;
  const next = index >= 0 && index < outline.length - 1 ? outline[index + 1] : null;
  const withLearner = (href: string) =>
    learnerParam === "member" ? href : `${href}?learner=${learnerParam}`;
  const { lesson } = detail;
  const title = localizedField(lesson.localized, locale, "title", lesson.title) ?? lesson.title;
  const description = localizedField(lesson.localized, locale, "description", lesson.description);
  const body = localizedField(lesson.localized, locale, "body", lesson.body);
  const moduleTitle = current
    ? localizedField(current.module_localized, locale, "title", current.module_title)
    : null;
  const moduleLessons = current
    ? outline
        .filter((row) => row.module_id === current.module_id)
        .map((row) => ({
          id: row.lesson_id,
          href: withLearner(`/training/lessons/${row.lesson_id}`),
          title: localizedField(row.lesson_localized, locale, "title", row.lesson_title) ?? row.lesson_title,
          completed: row.completed,
        }))
    : [];

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <Link
        className="text-sm font-semibold text-link underline underline-offset-4"
        href={withLearner("/training")}
      >
        {t("backToLibrary")}
      </Link>
      <LessonHero
        badge={moduleTitle}
        description={description}
        note={t("trackingProgressFor", { name: learnerName ?? t("me") })}
        title={title}
      />
      <LessonModuleNav current={lesson.id} label={t("lessonsInModule")} lessons={moduleLessons} />
      <LessonPlayer
        initialPercentage={current?.progress_percentage ?? 0}
        learner={learnerParam}
        lessonId={lesson.id}
        locale={locale}
        title={title}
        videoEmbed={detail.videoEmbed}
        videoSrc={detail.videoSrc}
      />
      {body ? <LessonBody body={body} title={t("lessonContent")} /> : null}
      {detail.resourceHref ? (
        <LessonResource
          downloadHref={detail.resourceHref}
          downloadLabel={
            detail.resourceIsPdf ? t("downloadFile") : (lesson.resource_label ?? t("openResource"))
          }
          isPdf={detail.resourceIsPdf}
          label={lesson.resource_label ?? t("lessonMaterial")}
          viewHref={detail.resourceViewHref ?? detail.resourceHref}
          viewerTitle={title}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5">
        {current?.completed ? (
          <>
            <p className="font-semibold text-emerald-700" role="status">
              {t("lessonCompleted")}
            </p>
            <form action={resetLessonProgressAction.bind(null, locale, lesson.id, learnerParam)}>
              <Button size="sm" type="submit" variant="ghost">
                {t("markIncomplete")}
              </Button>
            </form>
          </>
        ) : (
          <form action={markLessonCompleteAction.bind(null, locale, lesson.id, learnerParam)}>
            <Button type="submit">{t("markComplete")}</Button>
          </form>
        )}
      </div>
      <nav aria-label={t("lessonNavigation")} className="flex justify-between gap-3">
        {previous ? (
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm font-semibold"
            href={withLearner(`/training/lessons/${previous.lesson_id}`)}
          >
            ← {localizedField(previous.lesson_localized, locale, "title", previous.lesson_title)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm font-semibold"
            href={withLearner(`/training/lessons/${next.lesson_id}`)}
          >
            {localizedField(next.lesson_localized, locale, "title", next.lesson_title)} →
          </Link>
        ) : null}
      </nav>
      <p className="text-xs text-muted-foreground">{t("certificationDisclaimer")}</p>
    </article>
  );
}
