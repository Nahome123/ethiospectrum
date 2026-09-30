import { ArrowDown, ArrowUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { TrainingMediaUpload } from "@/components/training/training-media-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Status = "draft" | "published" | "archived";
const statusTone = { draft: "warning", published: "success", archived: "neutral" } as const;

function loc(value: unknown, locale: "am" | "es", field: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const entry = (value as Record<string, unknown>)[locale];
  if (!entry || typeof entry !== "object") return "";
  const result = (entry as Record<string, unknown>)[field];
  return typeof result === "string" ? result : "";
}

async function ItemControls({
  entity,
  id,
  locale,
  status,
}: {
  entity: "course" | "module" | "lesson";
  id: string;
  locale: AppLocale;
  status: Status;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const next: Status[] =
    status === "published"
      ? ["draft", "archived"]
      : status === "draft"
        ? ["published", "archived"]
        : ["draft"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill label={t(`status.${status}`)} tone={statusTone[status]} />
      {next.map((value) => (
        <form action={setTrainingStatusAction.bind(null, locale, entity, id, value)} key={value}>
          <button
            className="rounded-full border px-2.5 py-0.5 text-xs font-semibold hover:bg-secondary"
            type="submit"
          >
            {t(`setStatus.${value}`)}
          </button>
        </form>
      ))}
      <form action={moveTrainingItemAction.bind(null, locale, entity, id, "up")}>
        <button aria-label={t("moveUp")} className="rounded-full border p-1 hover:bg-secondary" type="submit">
          <ArrowUp aria-hidden="true" className="size-3.5" />
        </button>
      </form>
      <form action={moveTrainingItemAction.bind(null, locale, entity, id, "down")}>
        <button
          aria-label={t("moveDown")}
          className="rounded-full border p-1 hover:bg-secondary"
          type="submit"
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
        </button>
      </form>
    </div>
  );
}

async function StatusSelect({
  defaultValue,
  id,
  locale,
}: {
  defaultValue: Status;
  id: string;
  locale: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("statusLabel")}</Label>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        defaultValue={defaultValue}
        id={id}
        name="status"
      >
        {(["draft", "published", "archived"] as const).map((value) => (
          <option key={value} value={value}>
            {t(`status.${value}`)}
          </option>
        ))}
      </select>
    </div>
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

async function LessonForm({
  lesson,
  locale,
  moduleId,
}: {
  lesson: TrainingLesson | null;
  locale: AppLocale;
  moduleId: string;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const key = lesson?.id ?? `new-${moduleId}`;
  return (
    <ActionForm
      action={saveTrainingLessonAction.bind(null, locale)}
      pendingLabel={t("saving")}
      submitLabel={t("saveLesson")}
    >
      <input name="id" type="hidden" value={lesson?.id ?? ""} />
      <input name="moduleId" type="hidden" value={moduleId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${key}-title`}>{t("lessonTitle")}</Label>
          <Input defaultValue={lesson?.title} id={`${key}-title`} maxLength={160} name="title" required />
        </div>
        <StatusSelect
          defaultValue={(lesson?.status as Status) ?? "draft"}
          id={`${key}-status`}
          locale={locale}
        />
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
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-body`}>{t("lessonNotes")}</Label>
        <Textarea
          defaultValue={lesson?.body ?? ""}
          id={`${key}-body`}
          maxLength={20000}
          name="body"
          rows={4}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-video`}>{t("videoUrl")}</Label>
          <Input
            defaultValue={lesson?.video_url ?? ""}
            id={`${key}-video`}
            name="videoUrl"
            placeholder="https://www.youtube.com/watch?v=…"
            type="url"
          />
          {lesson?.video_storage_path ? (
            <p className="text-xs text-muted-foreground">{t("uploadedVideoInUse")}</p>
          ) : null}
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
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-resource`}>{t("resourceUrl")}</Label>
          <Input
            defaultValue={lesson?.resource_url ?? ""}
            id={`${key}-resource`}
            name="resourceUrl"
            placeholder="https://… or /training/rbt"
          />
          {lesson?.resource_storage_path ? (
            <p className="text-xs text-muted-foreground">{t("uploadedResourceInUse")}</p>
          ) : null}
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
      <TranslationFields
        fields={["title", "description", "body"]}
        idPrefix={key}
        locale={locale}
        localized={lesson?.localized}
      />
    </ActionForm>
  );
}

async function ModuleBlock({
  lessons,
  locale,
  module,
}: {
  lessons: TrainingLesson[];
  locale: AppLocale;
  module: TrainingModule;
}) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  return (
    <li className="rounded-xl border bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-bold">{module.title}</h3>
        <ItemControls entity="module" id={module.id} locale={locale} status={module.status as Status} />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold underline">{t("editModule")}</summary>
        <div className="mt-3">
          <ActionForm
            action={saveTrainingModuleAction.bind(null, locale)}
            pendingLabel={t("saving")}
            submitLabel={t("saveModule")}
          >
            <input name="id" type="hidden" value={module.id} />
            <input name="courseId" type="hidden" value={module.course_id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`${module.id}-title`}>{t("moduleTitle")}</Label>
                <Input
                  defaultValue={module.title}
                  id={`${module.id}-title`}
                  maxLength={160}
                  name="title"
                  required
                />
              </div>
              <StatusSelect
                defaultValue={module.status as Status}
                id={`${module.id}-status`}
                locale={locale}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${module.id}-description`}>{t("summary")}</Label>
              <Textarea
                defaultValue={module.description ?? ""}
                id={`${module.id}-description`}
                name="description"
                rows={2}
              />
            </div>
            <TranslationFields
              fields={["title", "description"]}
              idPrefix={module.id}
              locale={locale}
              localized={module.localized}
            />
          </ActionForm>
        </div>
      </details>
      <ul className="mt-4 space-y-3">
        {lessons.map((lesson) => (
          <li className="rounded-lg border bg-white p-3" key={lesson.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{lesson.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    lesson.video_url || lesson.video_storage_path ? t("hasVideo") : null,
                    lesson.resource_url || lesson.resource_storage_path ? t("hasResource") : null,
                    lesson.duration_minutes ? t("minutes", { count: lesson.duration_minutes }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("textOnly")}
                </p>
              </div>
              <ItemControls entity="lesson" id={lesson.id} locale={locale} status={lesson.status as Status} />
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold underline">{t("editLesson")}</summary>
              <div className="mt-3 space-y-4">
                <LessonForm lesson={lesson} locale={locale} moduleId={module.id} />
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-semibold">{t("privateMedia")}</p>
                  <TrainingMediaUpload kind="video" lessonId={lesson.id} locale={locale} />
                  <TrainingMediaUpload kind="resource" lessonId={lesson.id} locale={locale} />
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary underline">
          {t("addLesson")}
        </summary>
        <div className="mt-3 rounded-lg border bg-white p-3">
          <LessonForm lesson={null} locale={locale} moduleId={module.id} />
        </div>
      </details>
    </li>
  );
}

async function CourseForm({ course, locale }: { course: TrainingCourse | null; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const key = course?.id ?? "new-course";
  return (
    <ActionForm
      action={saveTrainingCourseAction.bind(null, locale)}
      pendingLabel={t("saving")}
      submitLabel={t("saveCourse")}
    >
      <input name="id" type="hidden" value={course?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-title`}>{t("courseTitle")}</Label>
          <Input defaultValue={course?.title} id={`${key}-title`} maxLength={160} name="title" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-slug`}>{t("slug")}</Label>
          <Input
            defaultValue={course?.slug}
            id={`${key}-slug`}
            name="slug"
            pattern="[a-z0-9][a-z0-9-]{1,79}"
            required
          />
        </div>
        <StatusSelect
          defaultValue={(course?.status as Status) ?? "draft"}
          id={`${key}-status`}
          locale={locale}
        />
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
      <TranslationFields
        fields={["title", "description"]}
        idPrefix={key}
        locale={locale}
        localized={course?.localized}
      />
    </ActionForm>
  );
}

export default async function AdminTrainingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminTraining" });
  const { courses, modules, lessons } = await getAdminTrainingTree();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("progressNotice")}</p>
      </div>
      <ul className="space-y-6">
        {courses.map((course) => (
          <li className="rounded-2xl border bg-white p-5" key={course.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{course.title}</h2>
                <p className="text-sm text-muted-foreground">/{course.slug}</p>
              </div>
              <ItemControls entity="course" id={course.id} locale={locale} status={course.status as Status} />
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold underline">{t("editCourse")}</summary>
              <div className="mt-3">
                <CourseForm course={course} locale={locale} />
              </div>
            </details>
            <ul className="mt-4 space-y-4">
              {modules
                .filter((module) => module.course_id === course.id)
                .map((module) => (
                  <ModuleBlock
                    key={module.id}
                    lessons={lessons.filter((lesson) => lesson.module_id === module.id)}
                    locale={locale}
                    module={module}
                  />
                ))}
            </ul>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-primary underline">
                {t("addModule")}
              </summary>
              <div className="mt-3">
                <ActionForm
                  action={saveTrainingModuleAction.bind(null, locale)}
                  pendingLabel={t("saving")}
                  submitLabel={t("saveModule")}
                >
                  <input name="id" type="hidden" value="" />
                  <input name="courseId" type="hidden" value={course.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`new-module-${course.id}`}>{t("moduleTitle")}</Label>
                      <Input id={`new-module-${course.id}`} maxLength={160} name="title" required />
                    </div>
                    <StatusSelect
                      defaultValue="draft"
                      id={`new-module-status-${course.id}`}
                      locale={locale}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`new-module-description-${course.id}`}>{t("summary")}</Label>
                    <Textarea id={`new-module-description-${course.id}`} name="description" rows={2} />
                  </div>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="rounded-2xl border bg-white p-5">
        <summary className="cursor-pointer font-semibold text-primary">{t("addCourse")}</summary>
        <div className="mt-3">
          <CourseForm course={null} locale={locale} />
        </div>
      </details>
    </section>
  );
}
