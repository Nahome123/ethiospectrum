import {
  BookOpen,
  CalendarDays,
  FileText,
  HeartPulse,
  Landmark,
  Scale,
  Stethoscope,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { MemberResourceCard } from "@/lib/resources/server";
import { ResourceCardActions } from "./resource-card-actions";

const categoryPresentation: Record<MemberResourceCard["category"], { Icon: LucideIcon; className: string }> =
  {
    general: { Icon: BookOpen, className: "from-slate-100 to-slate-200 text-slate-700" },
    healthcare: { Icon: HeartPulse, className: "from-rose-100 to-orange-100 text-rose-700" },
    education: { Icon: BookOpen, className: "from-amber-100 to-yellow-200 text-amber-800" },
    therapy: { Icon: Stethoscope, className: "from-cyan-100 to-sky-200 text-cyan-800" },
    benefits: { Icon: Landmark, className: "from-emerald-100 to-lime-200 text-emerald-800" },
    legal: { Icon: Scale, className: "from-violet-100 to-purple-200 text-violet-800" },
    family_support: { Icon: UsersRound, className: "from-pink-100 to-rose-200 text-pink-800" },
    other: { Icon: FileText, className: "from-blue-100 to-indigo-200 text-blue-800" },
  };

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
  const { Icon, className } = categoryPresentation[resource.category];
  const TypeIcon = typeIcons[resource.resourceType] ?? BookOpen;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div
        className={`relative flex aspect-[16/8] items-center justify-center bg-gradient-to-br ${className}`}
      >
        <Icon aria-hidden="true" className="size-16 opacity-80" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm">
          {categoryLabel}
        </span>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm">
          <TypeIcon aria-hidden="true" className="size-3.5" />
          {typeLabel}
        </span>
      </div>
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
