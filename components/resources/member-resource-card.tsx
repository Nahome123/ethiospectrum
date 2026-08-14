import { BookOpen, CalendarDays, FileText, Video, type LucideIcon } from "lucide-react";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { MemberResourceCard } from "@/lib/resources/server";
import { ResourceCardActions } from "./resource-card-actions";
import { ResourceCoverPlaceholder } from "./resource-cover-placeholder";

const typeIcons: Partial<Record<MemberResourceCard["resourceType"], LucideIcon>> = {
  video: Video,
  event_recap: CalendarDays,
  template: FileText,
};

export function MemberResourceCardView({
  categoryLabel,
  fallbackNotice,
  locale,
  resource,
  typeLabel,
}: {
  categoryLabel: string;
  fallbackNotice?: string;
  locale: AppLocale;
  resource: MemberResourceCard;
  typeLabel: string;
}) {
  const TypeIcon = typeIcons[resource.resourceType] ?? BookOpen;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <ResourceCoverPlaceholder
        category={resource.category}
        categoryLabel={categoryLabel}
        className="aspect-[16/8]"
      >
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm">
          <TypeIcon aria-hidden="true" className="size-3.5" />
          {typeLabel}
        </span>
      </ResourceCoverPlaceholder>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-6">
          <Link className="hover:underline" href={`/member/resources/${resource.slug}`}>
            {resource.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{resource.summary}</p>
        {fallbackNotice ? (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            {fallbackNotice}
          </p>
        ) : null}
        <div className="mt-auto pt-5">
          <ResourceCardActions
            initialBookmarked={resource.isBookmarked}
            locale={locale}
            slug={resource.slug}
          />
        </div>
      </div>
    </article>
  );
}
