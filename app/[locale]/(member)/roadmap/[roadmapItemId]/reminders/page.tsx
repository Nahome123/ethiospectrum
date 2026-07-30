import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getPersonalReminders } from "@/lib/reminders/server";
import { roadmapItemIdSchema } from "@/lib/validation/roadmap";

export default async function RoadmapReminderListPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; roadmapItemId: string }> }>) {
  const { locale: localeParam, roadmapItemId } = await params;
  const locale = localeParam as AppLocale;
  if (!roadmapItemIdSchema.safeParse(roadmapItemId).success) notFound();
  const [t, reminders] = await Promise.all([
    getTranslations({ locale, namespace: "reminders" }),
    getPersonalReminders(),
  ]);
  const items = reminders.filter((reminder) => reminder.roadmap_item_id === roadmapItemId);
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      {items.length ? (
        <ul className="mt-5 space-y-3">
          {items.map((reminder) => (
            <li className="rounded-xl border p-4" key={reminder.id}>
              <Link className="font-semibold underline" href={`/reminders/${reminder.id}`}>
                {t(`statuses.${reminder.status}`)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border p-4 text-muted-foreground">{t("noReminders")}</p>
      )}
    </section>
  );
}
