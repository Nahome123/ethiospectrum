import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { TrainingMediaUpload } from "@/components/training/training-media-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  moveTrainingItemAction,
  saveTrainingCourseAction,
  saveTrainingLessonAction,
  saveTrainingModuleAction,
  setTrainingStatusAction,
} from "@/lib/training/admin-actions";
import {
  getAdminTrainingTree,
  type TrainingCourse,
  type TrainingLesson,
  type TrainingModule,
} from "@/lib/training/server";
import { cn } from "@/lib/utils";

type Status = "draft" | "published" | "archived";
type Entity = "course" | "module" | "lesson";
const statusTone = { draft: "warning", published: "success", archived: "neutral" } as const;

/**
 * What the editor panel shows, from the URL. One item is edited at a time:
 * `?course=` selects a course; `edit=course|module|lesson` with `id=` edits an
 * item; `new=course|module|lesson` (with `module=` for a lesson) adds one.
 */
type EditorTarget =
  | { kind: "none" }
  | { kind: "course"; course: TrainingCourse | null }
  | { kind: "module"; module: TrainingModule | null; courseId: string }
  | { kind: "lesson"; lesson: TrainingLesson | null; moduleId: string };

function param(search: Record<string, string | string[] | undefined>, name: string): string {
  const value = search[name];
  return typeof value === "string" ? value : "";
}

function loc(value: unknown, locale: "am" | "es", field: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const entry = (value as Record<string, unknown>)[locale];
  if (!entry || typeof entry !== "object") return "";
  const result = (entry as Record<string, unknown>)[field];
  return typeof result === "string" ? result : "";
}

function href(courseId: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (courseId) params.set("course", courseId);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const text = params.toString();
  return text ? `/admin/training?${text}` : "/admin/training";
}

/** Publish/unpublish (or restore) in one click, plus reordering. Archiving lives in the editor. */
async function QuickControls({
  entity,
  id,
  locale,
  status,
}: {
  entity: Entity;
  id: string;
  locale: AppLocale;
  status: Status;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const next: Status = status === "published" ? "draft" : status === "draft" ? "published" : "draft";
  const label = status === "archived" ? t("restore") : t(`setStatus.${next}`);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <StatusPill label={t(`status.${status}`)} tone={statusTone[status]} />
      <form action={setTrainingStatusAction.bind(null, locale, entity, id, next)}>
        <button
          className="rounded-lg border px-2.5 py-0.5 text-xs font-semibold hover:bg-secondary"
          type="submit"
        >
          {label}
        </button>
      </form>
      <form action={moveTrainingItemAction.bind(null, locale, entity, id, "up")}>
        <button aria-label={t("moveUp")} className="rounded-lg border p-1 hover:bg-secondary" type="submit">
          <ArrowUp aria-hidden="true" className="size-3.5" />
        </button>
      </form>
      <form action={moveTrainingItemAction.bind(null, locale, entity, id, "down")}>
        <button aria-label={t("moveDown")} className="rounded-lg border p-1 hover:bg-secondary" type="submit">
          <ArrowDown aria-hidden="true" className="size-3.5" />
        </button>
      </form>
    </div>
  );
}

async function StatusChoice({ defaultValue, locale }: { defaultValue: Status; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("statusLabel")}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {(["draft", "published", "archived"] as const).map((value) => (
          <label className="flex items-center gap-2" key={value}>
            <input
              className="size-4"
              defaultChecked={defaultValue === value}
              name="status"
              type="radio"
              value={value}
            />
            {t(`status.${value}`)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("statusHelp")}</p>
    </fieldset>
  );
}

async function TranslationFields({
  fields,
  idPrefix,
  locale,
  localized,
}: {
  fields: readonly ("title" | "description" | "body")[];
  idPrefix: string;
  locale: AppLocale;
  localized: unknown;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t("translations")}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["am", "es"] as const).map((language) =>
          fields.map((field) => (
            <div className="space-y-1.5" key={`${language}-${field}`}>
              <Label htmlFor={`${idPrefix}-${language}-${field}`}>
                {t(`translationField.${language}.${field}`)}
              </Label>
              {field === "title" ? (
                <Input
                  defaultValue={loc(localized, language, field)}
                  id={`${idPrefix}-${language}-${field}`}
                  maxLength={160}
                  name={`${language}.${field}`}
                />
              ) : (
                <Textarea
                  defaultValue={loc(localized, language, field)}
                  id={`${idPrefix}-${language}-${field}`}
                  name={`${language}.${field}`}
                  rows={field === "body" ? 5 : 2}
                />
              )}
            </div>
          )),
        )}
      </div>
    </details>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

async function CourseEditor({ course, locale }: { course: TrainingCourse | null; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const key = course?.id ?? "new-course";
  return (
    <ActionForm
      action={saveTrainingCourseAction.bind(null, locale)}
      key={key}
      pendingLabel={t("saving")}
      submitLabel={t("saveCourse")}
    >
      <input name="id" type="hidden" value={course?.id ?? ""} />
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-title`}>{t("courseTitle")}</Label>
        <Input defaultValue={course?.title} id={`${key}-title`} maxLength={160} name="title" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-slug`}>{t("slug")}</Label>
        <Input
          aria-describedby={`${key}-slug-help`}
          defaultValue={course?.slug}
          id={`${key}-slug`}
          name="slug"
          pattern="[a-z0-9][a-z0-9-]{1,79}"
          required
        />
        <p className="text-xs text-muted-foreground" id={`${key}-slug-help`}>
          {t("slugHelp")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-description`}>{t("summary")}</Label>
        <Textarea
          defaultValue={course?.description ?? ""}
          id={`${key}-description`}
          maxLength={4000}
          name="description"
          rows={3}
        />
      </div>
      <StatusChoice defaultValue={(course?.status as Status) ?? "draft"} locale={locale} />
      <TranslationFields
        fields={["title", "description"]}
        idPrefix={key}
        locale={locale}
        localized={course?.localized}
      />
    </ActionForm>
  );
}

async function ModuleEditor({
  courseId,
  locale,
  module,
}: {
  courseId: string;
  locale: AppLocale;
  module: TrainingModule | null;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const key = module?.id ?? `new-module-${courseId}`;
  return (
    <ActionForm
      action={saveTrainingModuleAction.bind(null, locale)}
      key={key}
      pendingLabel={t("saving")}
      submitLabel={t("saveModule")}
    >
      <input name="id" type="hidden" value={module?.id ?? ""} />
      <input name="courseId" type="hidden" value={courseId} />
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-title`}>{t("moduleTitle")}</Label>
        <Input defaultValue={module?.title} id={`${key}-title`} maxLength={160} name="title" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-description`}>{t("summary")}</Label>
        <Textarea
          defaultValue={module?.description ?? ""}
          id={`${key}-description`}
          name="description"
          rows={2}
        />
      </div>
      <StatusChoice defaultValue={(module?.status as Status) ?? "draft"} locale={locale} />
      <TranslationFields
        fields={["title", "description"]}
        idPrefix={key}
        locale={locale}
        localized={module?.localized}
      />
    </ActionForm>
  );
}

async function LessonEditor({
  lesson,
  locale,
  moduleId,
}: {
  lesson: TrainingLesson | null;
  locale: AppLocale;
  moduleId: string;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const key = lesson?.id ?? `new-lesson-${moduleId}`;
  return (
    <div className="space-y-6">
      <ActionForm
        action={saveTrainingLessonAction.bind(null, locale)}
        key={key}
        pendingLabel={t("saving")}
        submitLabel={t("saveLesson")}
      >
        <input name="id" type="hidden" value={lesson?.id ?? ""} />
        <input name="moduleId" type="hidden" value={moduleId} />
        <FormSection title={t("sectionBasics")}>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-title`}>{t("lessonTitle")}</Label>
            <Input defaultValue={lesson?.title} id={`${key}-title`} maxLength={160} name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-description`}>{t("summary")}</Label>
            <Textarea
              defaultValue={lesson?.description ?? ""}
              id={`${key}-description`}
              maxLength={4000}
              name="description"
              rows={2}
            />
          </div>
        </FormSection>
        <FormSection title={t("sectionVideo")}>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor={`${key}-video`}>{t("videoUrl")}</Label>
              <Input
                defaultValue={lesson?.video_url ?? ""}
                id={`${key}-video`}
                name="videoUrl"
                placeholder="https://www.youtube.com/watch?v=…"
                type="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${key}-duration`}>{t("durationMinutes")}</Label>
              <Input
                defaultValue={lesson?.duration_minutes ?? ""}
                id={`${key}-duration`}
                max={600}
                min={1}
                name="durationMinutes"
                type="number"
              />
            </div>
          </div>
          {lesson?.video_storage_path ? (
            <p className="text-xs text-muted-foreground">{t("uploadedVideoInUse")}</p>
          ) : null}
        </FormSection>
        <FormSection title={t("sectionResource")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${key}-resource`}>{t("resourceUrl")}</Label>
              <Input
                defaultValue={lesson?.resource_url ?? ""}
                id={`${key}-resource`}
                name="resourceUrl"
                placeholder="https://… or /training/rbt"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${key}-resource-label`}>{t("resourceLabel")}</Label>
              <Input
                defaultValue={lesson?.resource_label ?? ""}
                id={`${key}-resource-label`}
                maxLength={160}
                name="resourceLabel"
              />
            </div>
          </div>
          {lesson?.resource_storage_path ? (
            <p className="text-xs text-muted-foreground">{t("uploadedResourceInUse")}</p>
          ) : null}
        </FormSection>
        <FormSection title={t("sectionNotes")}>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-body`}>{t("lessonNotes")}</Label>
            <Textarea
              defaultValue={lesson?.body ?? ""}
              id={`${key}-body`}
              maxLength={20000}
              name="body"
              rows={5}
            />
          </div>
        </FormSection>
        <FormSection title={t("sectionPublishing")}>
          <StatusChoice defaultValue={(lesson?.status as Status) ?? "draft"} locale={locale} />
          <TranslationFields
            fields={["title", "description", "body"]}
            idPrefix={key}
            locale={locale}
            localized={lesson?.localized}
          />
        </FormSection>
      </ActionForm>
      {lesson ? (
        <section className="space-y-2 rounded-lg border bg-slate-50 p-4">
          <h3 className="text-sm font-semibold">{t("privateMedia")}</h3>
          <p className="text-xs text-muted-foreground">{t("privateMediaHelp")}</p>
          <TrainingMediaUpload kind="video" lessonId={lesson.id} locale={locale} />
          <TrainingMediaUpload kind="resource" lessonId={lesson.id} locale={locale} />
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">{t("uploadAfterSave")}</p>
      )}
    </div>
  );
}

function lessonMeta(lesson: TrainingLesson, t: (key: string, values?: Record<string, number>) => string) {
  return (
    [
      lesson.video_url || lesson.video_storage_path ? t("hasVideo") : null,
      lesson.resource_url || lesson.resource_storage_path ? t("hasResource") : null,
      lesson.duration_minutes ? t("minutes", { count: lesson.duration_minutes }) : null,
    ]
      .filter(Boolean)
      .join(" · ") || t("textOnly")
  );
}

export default async function AdminTrainingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const { courses, modules, lessons } = await getAdminTrainingTree();

  const course = courses.find((row) => row.id === param(search, "course")) ?? courses[0] ?? null;
  const courseModules = course ? modules.filter((row) => row.course_id === course.id) : [];
  const editKind = param(search, "edit");
  const newKind = param(search, "new");
  const itemId = param(search, "id");

  let target: EditorTarget = { kind: "none" };
  if (newKind === "course" || (!course && courses.length === 0)) {
    target = { kind: "course", course: null };
  } else if (course && editKind === "course") {
    target = { kind: "course", course };
  } else if (course && newKind === "module") {
    target = { kind: "module", module: null, courseId: course.id };
  } else if (course && editKind === "module") {
    const found = courseModules.find((row) => row.id === itemId);
    if (found) target = { kind: "module", module: found, courseId: course.id };
  } else if (course && newKind === "lesson") {
    const parent = courseModules.find((row) => row.id === param(search, "module"));
    if (parent) target = { kind: "lesson", lesson: null, moduleId: parent.id };
  } else if (course && editKind === "lesson") {
    const lesson = lessons.find((row) => row.id === itemId);
    if (lesson && courseModules.some((row) => row.id === lesson.module_id)) {
      target = { kind: "lesson", lesson, moduleId: lesson.module_id };
    }
  }

  const selectedId =
    target.kind === "course"
      ? target.course?.id
      : target.kind === "module"
        ? target.module?.id
        : target.kind === "lesson"
          ? target.lesson?.id
          : undefined;
  const editorTitle =
    target.kind === "course"
      ? target.course
        ? t("editCourse")
        : t("addCourse")
      : target.kind === "module"
        ? target.module
          ? t("editModule")
          : t("addModule")
        : target.kind === "lesson"
          ? target.lesson
            ? t("editLesson")
            : t("addLesson")
          : "";
  const closeHref = href(course?.id ?? null);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("progressNotice")}</p>
        </div>
        <Link
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          href={href(course?.id ?? null, { new: "course" })}
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("addCourse")}
        </Link>
      </div>

      {courses.length > 0 ? (
        <nav aria-label={t("coursesLabel")} className="flex flex-wrap gap-2">
          {courses.map((row) => (
            <Link
              aria-current={row.id === course?.id ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold",
                row.id === course?.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-white hover:bg-secondary",
              )}
              href={href(row.id)}
              key={row.id}
            >
              {row.title}
              <span className="text-xs font-normal opacity-80">{t(`status.${row.status as Status}`)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        {course ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-white p-5">
              <div className="min-w-0">
                <h2 className="text-xl font-bold">{course.title}</h2>
                <p className="text-sm text-muted-foreground">/{course.slug}</p>
                <Link
                  className="mt-2 inline-block text-sm font-semibold text-link underline"
                  href={href(course.id, { edit: "course" })}
                >
                  {t("editCourseDetails")}
                </Link>
              </div>
              <QuickControls
                entity="course"
                id={course.id}
                locale={locale}
                status={course.status as Status}
              />
            </div>

            <ol className="space-y-4">
              {courseModules.map((module, moduleIndex) => {
                const moduleLessons = lessons.filter((lesson) => lesson.module_id === module.id);
                return (
                  <li
                    className={cn(
                      "rounded-2xl border bg-white",
                      selectedId === module.id && "ring-2 ring-primary/40",
                    )}
                    key={module.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("moduleNumber", { number: moduleIndex + 1 })}
                        </p>
                        <h3 className="font-bold">{module.title}</h3>
                        <Link
                          className="text-sm font-semibold text-link underline"
                          href={href(course.id, { edit: "module", id: module.id })}
                        >
                          {t("edit")}
                        </Link>
                      </div>
                      <QuickControls
                        entity="module"
                        id={module.id}
                        locale={locale}
                        status={module.status as Status}
                      />
                    </div>
                    {moduleLessons.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">{t("noLessons")}</p>
                    ) : (
                      <ol className="divide-y">
                        {moduleLessons.map((lesson, lessonIndex) => (
                          <li
                            className={cn(
                              "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
                              selectedId === lesson.id && "bg-tint",
                            )}
                            key={lesson.id}
                          >
                            <Link
                              className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                              href={href(course.id, { edit: "lesson", id: lesson.id })}
                            >
                              <span className="font-semibold">
                                {moduleIndex + 1}.{lessonIndex + 1} {lesson.title}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {lessonMeta(lesson, t)}
                              </span>
                            </Link>
                            <QuickControls
                              entity="lesson"
                              id={lesson.id}
                              locale={locale}
                              status={lesson.status as Status}
                            />
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="border-t px-4 py-2">
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-semibold text-link"
                        href={href(course.id, { new: "lesson", module: module.id })}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        {t("addLesson")}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Link
              className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold text-link hover:bg-white"
              href={href(course.id, { new: "module" })}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("addModule")}
            </Link>
          </div>
        ) : (
          <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("noCourses")}</p>
        )}

        <aside aria-label={t("editorLabel")} className="xl:sticky xl:top-6 xl:self-start">
          {target.kind === "none" ? (
            <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-muted-foreground">
              {t("editorEmpty")}
            </div>
          ) : (
            <div className="rounded-2xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{editorTitle}</h2>
                <Link className="text-sm font-semibold underline" href={closeHref}>
                  {t("close")}
                </Link>
              </div>
              {target.kind === "course" ? <CourseEditor course={target.course} locale={locale} /> : null}
              {target.kind === "module" ? (
                <ModuleEditor courseId={target.courseId} locale={locale} module={target.module} />
              ) : null}
              {target.kind === "lesson" ? (
                <LessonEditor lesson={target.lesson} locale={locale} moduleId={target.moduleId} />
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
