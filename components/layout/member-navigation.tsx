"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type MemberNavigationItem = {
  href: string;
  label: string;
};

type MemberNavigationProps = {
  closeLabel: string;
  items: readonly MemberNavigationItem[];
  label: string;
  menuLabel: string;
  openLabel: string;
};

function isCurrentPath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function MemberNavigation({
  closeLabel,
  items,
  label,
  menuLabel,
  openLabel,
}: MemberNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        aria-controls="member-navigation"
        aria-expanded={isOpen}
        aria-label={isOpen ? closeLabel : openLabel}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 lg:hidden"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {isOpen ? <X aria-hidden="true" size={16} /> : <Menu aria-hidden="true" size={16} />}
        {menuLabel}
      </button>
      <nav
        aria-label={label}
        className={cn(
          "mt-4 grid min-w-0 gap-1 lg:mt-6 lg:grid",
          isOpen ? "grid" : "hidden lg:grid",
        )}
        id="member-navigation"
      >
        {items.map(({ href, label: itemLabel }) => {
          const isCurrent = isCurrentPath(pathname, href);
          return (
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "block min-w-0 rounded-md px-3 py-2 text-sm font-medium whitespace-normal break-words [overflow-wrap:anywhere] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                isCurrent ? "bg-secondary text-foreground" : "hover:bg-secondary",
              )}
              href={href}
              key={href}
              onClick={() => setIsOpen(false)}
            >
              {itemLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
