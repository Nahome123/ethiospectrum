import {
  BookOpen,
  FileText,
  HeartPulse,
  Landmark,
  Scale,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ResourceCategory } from "@/lib/resources/constants";

const coverPresentation: Record<ResourceCategory, { Icon: LucideIcon; className: string }> = {
  general: { Icon: BookOpen, className: "from-slate-100 via-slate-50 to-slate-200 text-slate-700" },
  healthcare: { Icon: HeartPulse, className: "from-rose-100 via-orange-50 to-amber-100 text-rose-700" },
  education: { Icon: BookOpen, className: "from-amber-100 via-yellow-50 to-yellow-200 text-amber-800" },
  therapy: { Icon: Stethoscope, className: "from-cyan-100 via-sky-50 to-sky-200 text-cyan-800" },
  benefits: { Icon: Landmark, className: "from-emerald-100 via-lime-50 to-lime-200 text-emerald-800" },
  legal: { Icon: Scale, className: "from-violet-100 via-purple-50 to-purple-200 text-violet-800" },
  family_support: { Icon: UsersRound, className: "from-pink-100 via-rose-50 to-rose-200 text-pink-800" },
  other: { Icon: FileText, className: "from-blue-100 via-indigo-50 to-indigo-200 text-blue-800" },
};

/**
 * A local, category-specific visual cover used until reviewed image storage is introduced.
 * It intentionally does not fetch a third-party image or expose an administrator-supplied URL.
 */
export function ResourceCoverPlaceholder({
  category,
  categoryLabel,
  children,
  className = "",
}: {
  category: ResourceCategory;
  categoryLabel: string;
  children?: ReactNode;
  className?: string;
}) {
  const { Icon, className: presentationClassName } = coverPresentation[category];

  return (
    <div
      aria-label={categoryLabel}
      className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br ${presentationClassName} ${className}`}
      data-slot="resource-cover-placeholder"
      role="img"
    >
      <span className="absolute -left-8 -top-8 size-36 rounded-full bg-white/35" />
      <span className="absolute -bottom-12 -right-8 size-44 rounded-full border-[18px] border-white/35" />
      <Icon aria-hidden="true" className="relative size-16 opacity-80" />
      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold shadow-sm">
        {categoryLabel}
      </span>
      {children}
    </div>
  );
}
