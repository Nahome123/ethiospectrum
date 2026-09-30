import { CheckCircle2, Circle, CirclePlay, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LearnerPicker } from "@/components/training/learner-picker";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { listDependentOptions } from "@/lib/services/server";
import {
  getTrainingAccess,
  getTrainingOutline,
  localizedField,
  parseLearner,
  type TrainingOutlineRow,
} from "@/lib/training/server";

type ModuleGroup = { id: string; title: string; description: string | null; lessons: TrainingOutlineRow[] };
type CourseGroup = { id: string; title: string; description: string | null; modules: ModuleGroup[] };

function group(rows: TrainingOutlineRow[], locale: string): CourseGroup[] {
  const courses = new Map<string, CourseGroup>();
  for (const row of rows) {
    let course = courses.get(row.course_id);
    if (!course) {
      course = {
        id: row.course_id,
        title: localizedField(row.course_localized, locale, "title", row.course_title) ?? row.course_title,
        description: localizedField(row.course_localized, locale, "description", row.course_description),
        modules: [],
      };
      courses.set(row.course_id, course);
    }
    let courseModule = course.modules.find((item) => item.id === row.module_id);
    if (!courseModule) {
      courseModule = {
        id: row.module_id,
        title: localizedField(row.module_localized, locale, "title", row.module_title) ?? row.module_title,
        description: localizedField(row.module_localized, locale, "description", row.module_description),
        lessons: [],
      };
      course.modules.push(courseModule);
    }
    courseModule.lessons.push(row);
  }
  return [...courses.values()];
}

export default async function TrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "bootcamp" });
  const access = await getTrainingAccess();

  if (!access.hasAccess) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border bg-white p-8">
          <Lock aria-hidden="true" className="size-9 text-primary" />
          <h1 className="mt-4 text-3xl font-bold">{t("lockedTitle")}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">{t("lockedDescription")}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            <li>{t("benefitVideos")}</li>
            <li>{t("benefitResources")}</li>
            <li>{t("benefitProgress")}</li>
          </ul>
          {access.hasSubscription ? (
            <p className="mt-6 text-sm font-medium" role="status">
              {t("askOwnerForAccess")}
            </p>
          ) : access.canSubscribe ? (
            <Link
              className="mt-6 inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
              href="/billing"
            >
              {t("subscribe")}
            </Link>
          ) : (
            <p className="mt-6 text-sm font-medium" role="status">
              {t("askOwnerToSubscribe")}
            </p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">{t("certificationDisclaimer")}</p>
        </div>
      </section>
    );
  }

  const learner = parseLearner(search.learner);
  const household = await getHouseholdAccess();
  const dependents = household ? await listDependentOptions(household.household.id) : [];
  const validLearner =
    learner.type === "dependent" && !dependents.some((item) => item.id === learner.dependentId)
      ? { type: "member" as const }
      : learner;
  const learnerParam = validLearner.type === "dependent" ? validLearner.dependentId : "member";
  const outline = await getTrainingOutline(validLearner);
  const courses = group(outline, locale);
  const completed = outline.filter((row) => row.completed).length;
  const overall = outline.length ? Math.round((completed / outline.length) * 100) : 0;
  const lessonHref = (lessonId: string) =>
    learnerParam === "member"
      ? `/training/lessons/${lessonId}`
      : `/training/lessons/${lessonId}?learner=${learnerParam}`;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("intro")}</p>
        </div>
        <LearnerPicker action={`/${locale}/training`} dependents={dependents} selected={learnerParam} />
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>{t("overallProgress")}</span>
          <span>{t("lessonsCompleted", { completed, total: outline.length })}</span>
        </div>
        <div
          aria-label={t("overallProgress")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={overall}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${overall}%` }} />
        </div>
      </div>
      {courses.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("noContent")}</p>
      ) : (
        courses.map((course) => (
          <article className="space-y-4" key={course.id}>
            <div>
              <h2 className="text-2xl font-bold">{course.title}</h2>
              {course.description ? <p className="mt-1 text-muted-foreground">{course.description}</p> : null}
            </div>
            {course.modules.map((courseModule, moduleIndex) => (
              <section className="rounded-2xl border bg-white p-5" key={courseModule.id}>
                <h3 className="font-bold">
                  {t("moduleNumber", { number: moduleIndex + 1 })}: {courseModule.title}
                </h3>
                {courseModule.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{courseModule.description}</p>
                ) : null}
                <ol className="mt-3 divide-y">
                  {courseModule.lessons.map((lesson) => {
                    const Icon = lesson.completed
                      ? CheckCircle2
                      : lesson.progress_percentage > 0
                        ? CirclePlay
                        : Circle;
                    return (
                      <li key={lesson.lesson_id}>
                        <Link
                          className="flex items-center justify-between gap-3 py-3 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                          href={lessonHref(lesson.lesson_id)}
                        >
                          <span className="flex items-center gap-3">
                            <Icon
                              aria-hidden="true"
                              className={
                                lesson.completed ? "size-5 text-emerald-600" : "size-5 text-muted-foreground"
                              }
                            />
                            <span>
                              <span className="font-medium">
                                {localizedField(
                                  lesson.lesson_localized,
                                  locale,
                                  "title",
                                  lesson.lesson_title,
                                )}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {[
                                  lesson.has_video ? t("video") : null,
                                  lesson.has_resource ? t("resource") : null,
                                  lesson.duration_minutes
                                    ? t("minutes", { count: lesson.duration_minutes })
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-muted-foreground">
                            {lesson.completed
                              ? t("completed")
                              : lesson.progress_percentage > 0
                                ? `${lesson.progress_percentage}%`
                                : t("notStarted")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </article>
        ))
      )}
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        {t("certificationDisclaimer")}
      </p>
    </section>
  );
}
