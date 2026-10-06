import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type FilterTab = {
  key: string;
  label: string;
  href: string;
  count?: number | null;
  active: boolean;
};

/**
 * The few most-used filters as a single row of underline tabs. The active tab
 * gets the orange underline; counts appear as small badges. Less common
 * filters belong in a FilterMenu placed in `actions`.
 */
export function FilterTabs({
  actions,
  label,
  tabs,
}: {
  actions?: React.ReactNode;
  label: string;
  tabs: FilterTab[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border">
      <nav aria-label={label} className="-mb-px flex max-w-full gap-6 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-[3px] px-0.5 pb-3 pt-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              tab.active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-input hover:text-foreground",
            )}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
            {tab.count ? (
              <span
                className={cn(
                  "rounded-full px-2 py-px text-xs font-bold",
                  tab.active ? "bg-[#fdebdd] text-[#c2450a]" : "bg-secondary text-link",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      {actions ? <div className="mb-2 ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
