import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getPersonalReminders } from "@/lib/reminders/server";

export default async function ReminderCentrePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const [t, reminders] = await Promise.all([
    getTranslations({ locale, namespace: "reminders" }),
    getPersonalReminders(),
  ]);
  const unseen = reminders.filter((reminder) => reminder.status === "delivered" && !reminder.seen_at).length;
  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>
      <p className="mt-4 text-sm font-semibold">
        {t("unseen")}: {unseen}
      </p>
      {reminders.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {reminders.map((reminder) => (
            <li className="rounded-xl border bg-card p-4" key={reminder.id}>
              <Link className="font-semibold underline" href={`/reminders/${reminder.id}`}>
                {t(`statuses.${reminder.status}`)}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                {reminder.scheduled_local_date} · {reminder.scheduled_local_time} · {reminder.timezone}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border p-5 text-muted-foreground">{t("noReminders")}</p>
      )}
    </section>
  );
}
