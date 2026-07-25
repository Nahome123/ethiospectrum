import { rbtTrainingContent } from "@/features/training/rbt/content";
import { rbtRouteBySection } from "@/features/training/rbt/constants";
import type { RbtSectionId } from "@/features/training/rbt/types";
import { Link } from "@/i18n/navigation";

export function RbtTrainingNavigation({
  basePath = "/training/rbt",
  currentSection,
  label,
}: {
  basePath?: string;
  currentSection: RbtSectionId;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-10 -mx-4 mb-6 overflow-x-auto border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="flex min-w-max gap-2">
        {rbtTrainingContent.navigation.map((item) => {
          const active = item.id === currentSection;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${active ? "bg-[#1a1a2e] text-[#f0c84a]" : "border border-border bg-card text-foreground hover:bg-muted"}`}
              href={`${basePath}/${rbtRouteBySection[item.id]}`}
              key={item.id}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
