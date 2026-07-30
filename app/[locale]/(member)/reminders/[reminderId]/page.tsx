import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ReminderCancelForm } from "@/components/reminders/reminder-cancel-form";
import { markReminderSeenAction } from "@/lib/reminders/actions";
import { getPersonalReminder } from "@/lib/reminders/server";
import { reminderIdSchema } from "@/lib/validation/reminder";

export default async function ReminderDetailsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; reminderId: string }> }>) {
  const { locale: localeParam, reminderId } = await params;
  const locale = localeParam as AppLocale;
  if (!reminderIdSchema.safeParse(reminderId).success) notFound();
  const [t, reminder] = await Promise.all([
    getTranslations({ locale, namespace: "reminders" }),
    getPersonalReminder(reminderId),
  ]);
  if (!reminder) notFound();
  return (
    <section className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold underline" href="/reminders">
        {t("title")}
      </Link>
      <h1 className="mt-5 text-3xl font-bold">{t("title")}</h1>
      <dl className="mt-5 grid gap-4 rounded-2xl border p-5">
        <div>
          <dt className="font-semibold">{t("deliveryDate")}</dt>
          <dd>
            {reminder.scheduled_local_date} {reminder.scheduled_local_time}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("timezone")}</dt>
          <dd>{reminder.timezone}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t("status")}</dt>
          <dd>{t(`statuses.${reminder.status}`)}</dd>
        </div>
      </dl>
      <div className="mt-5">
        {reminder.status === "scheduled" ? (
          <ReminderCancelForm locale={locale} reminderId={reminder.id} updatedAt={reminder.updated_at} />
        ) : null}
        {reminder.status === "delivered" && !reminder.seen_at ? (
          <form action={markReminderSeenAction.bind(null, locale, reminder.id)}>
            <button className="rounded-md border px-4 py-2 text-sm font-semibold" type="submit">
              {t("markSeen")}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
