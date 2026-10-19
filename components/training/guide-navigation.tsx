import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { GuideSequence } from "@/lib/training/guide-sequence";

/** Every module as a pill; each opens the guide of the module's first lesson. */
export function GuideModuleNav({
  label,
  moduleLabel,
  sequence,
}: {
  label: string;
  moduleLabel: (number: number) => string;
  sequence: GuideSequence;
}) {
  if (sequence.modules.length < 2) return null;
  return (
    <nav aria-label={label} className="overflow-x-auto rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex min-w-max gap-2">
        {sequence.modules.map((module, index) => {
          const active = module.id === sequence.currentModuleId;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${active ? "bg-[#1a1a2e] text-[#f0c84a]" : "border border-border bg-background text-foreground hover:bg-muted"}`}
              href={module.href}
              key={module.id}
            >
              {moduleLabel(index + 1)}: {module.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Previous / next lesson guides, naming the module when the step crosses into another one. */
export function GuideSequenceNav({
  label,
  labels,
  sequence,
}: {
  label: string;
  labels: { previousLesson: string; nextLesson: string; previousModule: string; nextModule: string };
  sequence: GuideSequence;
}) {
  const { previous, next, currentModuleId } = sequence;
  if (!previous && !next) return null;
  const card =
    "flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary sm:max-w-[48%]";
  return (
    <nav aria-label={label} className="flex flex-wrap justify-between gap-3">
      {previous ? (
        <Link className={card} href={previous.href}>
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0 text-link" />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {previous.moduleId === currentModuleId ? labels.previousLesson : labels.previousModule}
            </span>
            {previous.moduleId === currentModuleId ? null : (
              <span className="block text-sm font-semibold text-link">{previous.moduleTitle}</span>
            )}
            <span className="block truncate font-semibold">{previous.title}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className={`${card} justify-end text-right`} href={next.href}>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {next.moduleId === currentModuleId ? labels.nextLesson : labels.nextModule}
            </span>
            {next.moduleId === currentModuleId ? null : (
              <span className="block text-sm font-semibold text-link">{next.moduleTitle}</span>
            )}
            <span className="block truncate font-semibold">{next.title}</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-link" />
        </Link>
      ) : null}
    </nav>
  );
}
