import { notFound, redirect } from "next/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ReminderEditForm } from "@/components/reminders/reminder-edit-form";
import { getPersonalReminder } from "@/lib/reminders/server";
import { getRoadmapItem } from "@/lib/roadmap/server";
import { reminderIdSchema } from "@/lib/validation/reminder";

export default async function ReminderEditPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; reminderId: string }> }>) {
  const { locale: localeParam, reminderId } = await params;
  const locale = localeParam as AppLocale;
  if (!reminderIdSchema.safeParse(reminderId).success) notFound();
  const reminder = await getPersonalReminder(reminderId);
  if (!reminder) notFound();
  if (reminder.status !== "scheduled") redirect(`/${locale}/reminders/${reminder.id}`);
  const item = await getRoadmapItem(reminder.roadmap_item_id);
  if (!item || !item.due_date || item.archived_at || ["completed", "cancelled"].includes(item.status))
    notFound();
  return (
    <section className="mx-auto max-w-2xl">
      <ReminderEditForm
        dueDate={item.due_date}
        locale={locale}
        reminder={{
          id: reminder.id,
          offsetDays: reminder.offset_days,
          localTime: reminder.scheduled_local_time,
          scheduleVersion: reminder.schedule_version,
          timezone: reminder.timezone,
        }}
      />
    </section>
  );
}
