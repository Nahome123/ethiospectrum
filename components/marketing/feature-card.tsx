import type { LucideIcon } from "lucide-react";

export function FeatureCard({
  icon: Icon,
  title,
  description,
  label,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  label?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <Icon aria-hidden="true" className="size-7 text-primary" />
      <h3 className="mt-5 text-xl font-bold">{title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
      {label && <p className="mt-5 text-sm font-semibold text-secondary-foreground">{label}</p>}
    </article>
  );
}
