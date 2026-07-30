import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { ReminderForm } from "@/components/reminders/reminder-form";
import { getRoadmapItem } from "@/lib/roadmap/server";
import { roadmapItemIdSchema } from "@/lib/validation/roadmap";

export default async function NewReminderPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; roadmapItemId: string }> }>) {
  const { locale: localeParam, roadmapItemId } = await params;
  const locale = localeParam as AppLocale;
  if (!roadmapItemIdSchema.safeParse(roadmapItemId).success) notFound();
  const item = await getRoadmapItem(roadmapItemId);
  if (!item || !item.due_date || item.archived_at || ["completed", "cancelled"].includes(item.status))
    notFound();
  return (
    <section className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold underline" href={`/roadmap/${item.id}`}>
        Back
      </Link>
      <div className="mt-5">
        <ReminderForm dueDate={item.due_date} itemId={item.id} locale={locale} title={item.title} />
      </div>
    </section>
  );
}
