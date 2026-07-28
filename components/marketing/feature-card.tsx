import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

export function FeatureCard({
  icon: Icon,
  title,
  description,
  label,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  label?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <Icon aria-hidden="true" className="size-7 text-primary" />
      <h3 className="mt-5 text-xl font-bold">{title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
      {label && <p className="mt-5 text-sm font-semibold text-secondary-foreground">{label}</p>}
      {actionHref && actionLabel && (
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      )}
    </article>
  );
}
