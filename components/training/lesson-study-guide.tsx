import { FileDown, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";

/*
 * The study guide look of module 2.1 (Errorless teaching), shared by every
 * lesson: a hero banner, a sticky row of lesson pills, section cards, and
 * the lesson's file shown in the page.
 */

export function LessonHero({
  badge,
  description,
  note,
  title,
}: {
  badge?: string | null;
  description?: string | null;
  note?: string;
  title: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-4xl bg-linear-to-br from-[#1a6b3c] via-[#0d4a27] to-[#1a1a2e] px-5 py-10 text-center text-white shadow-lg sm:px-10 sm:py-12">
      <div aria-hidden="true" className="mb-6 flex justify-center">
        <span className="h-1.5 w-10 rounded-full bg-[#2d9a5a]" />
        <span className="h-1.5 w-10 rounded-full bg-[#f0c84a]" />
        <span className="h-1.5 w-10 rounded-full bg-[#b5251e]" />
      </div>
      {badge ? (
        <p className="mb-5 inline-block rounded-full border border-[#f0c84a]/50 bg-[#c8982a]/25 px-4 py-1.5 text-xs font-semibold tracking-[0.15em] text-[#f0c84a] uppercase">
          {badge}
        </p>
      ) : null}
      <h1 className="font-heading text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
      {description ? <p className="mx-auto mt-3 max-w-2xl text-white/85">{description}</p> : null}
      {note ? <p className="mt-3 text-sm text-white/70">{note}</p> : null}
    </section>
  );
}

export function LessonModuleNav({
  current,
  label,
  lessons,
}: {
  current: string;
  label: string;
  lessons: { id: string; href: string; title: string; completed: boolean }[];
}) {
  if (lessons.length < 2) return null;
  return (
    <nav
      aria-label={label}
      className="sticky top-0 z-10 -mx-4 overflow-x-auto border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="flex min-w-max gap-2">
        {lessons.map((lesson, index) => {
          const active = lesson.id === current;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${active ? "bg-[#1a1a2e] text-[#f0c84a]" : "border border-border bg-card text-foreground hover:bg-muted"}`}
              href={lesson.href}
              key={lesson.id}
            >
              {index + 1}. {lesson.title}
              {lesson.completed ? <span aria-hidden="true"> ✓</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const bullet = /^\s*[•\-*]\s+/;

/** "Myth: text" style lines get a bold label when the label is short. */
function LabelledLine({ line }: { line: string }) {
  const match = /^([^:.]{1,24}):\s+(.+)$/.exec(line);
  if (!match) return <>{line}</>;
  return (
    <>
      <strong className="font-bold text-[#1a6b3c]">{match[1]}:</strong> {match[2]}
    </>
  );
}

/**
 * Lesson text becomes section blocks: bullet groups become a ruled list,
 * other groups paragraphs, and a short closing line a highlight box.
 */
export function LessonBody({ body, title }: { body: string; title: string }) {
  const blocks = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  return (
    <section className="rounded-3xl border border-[#dde8e2] border-l-5 border-l-[#1a6b3c] bg-white p-5 shadow-sm sm:p-8">
      <h2 className="font-heading text-2xl font-bold text-[#1a6b3c]">{title}</h2>
      <div className="mt-4 space-y-4 leading-7">
        {blocks.map((lines, index) => {
          const key = `${index}-${lines[0]}`;
          const bulletLines = lines.filter((line) => bullet.test(line));
          if (
            bulletLines.length > 0 &&
            (bulletLines.length === lines.length ||
              (bulletLines.length === lines.length - 1 && !bullet.test(lines[0])))
          ) {
            const heading = bullet.test(lines[0]) ? null : lines[0];
            return (
              <div key={key}>
                {heading ? <p className="font-semibold">{heading}</p> : null}
                <ul className="mt-1">
                  {bulletLines.map((line) => (
                    <li
                      className="flex gap-3 border-b border-dashed border-[#dde8e2] py-2.5 last:border-0"
                      key={line}
                    >
                      <span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-[#2d9a5a]" />
                      <span>
                        <LabelledLine line={line.replace(bullet, "")} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
          if (
            index === blocks.length - 1 &&
            blocks.length > 1 &&
            lines.length === 1 &&
            lines[0].length <= 200
          ) {
            return (
              <p className="rounded-2xl border border-[#b2d8c2] bg-[#e8f5ee] p-5 font-semibold" key={key}>
                {lines[0]}
              </p>
            );
          }
          return (
            <p key={key}>
              {lines.map((line, lineIndex) => (
                <span className="block" key={`${lineIndex}-${line}`}>
                  <LabelledLine line={line} />
                </span>
              ))}
            </p>
          );
        })}
      </div>
    </section>
  );
}

/** The lesson's file: PDFs open in the page, other files as a download card. */
export function LessonResource({
  downloadHref,
  downloadLabel,
  isPdf,
  label,
  viewHref,
  viewerTitle,
}: {
  downloadHref: string;
  downloadLabel: string;
  isPdf: boolean;
  label: string;
  viewHref: string;
  viewerTitle: string;
}) {
  const external = !downloadHref.startsWith("/");
  const linkClass =
    "inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:border-primary";
  return (
    <section className="rounded-3xl border border-[#dde8e2] border-l-5 border-l-[#c8982a] bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-[#9a721f]">
          <FileText aria-hidden="true" className="size-6" />
          {label}
        </h2>
        {external ? (
          <a className={linkClass} href={downloadHref} rel="noopener noreferrer" target="_blank">
            <FileDown aria-hidden="true" className="size-4" />
            {downloadLabel}
          </a>
        ) : (
          <Link className={linkClass} href={downloadHref}>
            <FileDown aria-hidden="true" className="size-4" />
            {downloadLabel}
          </Link>
        )}
      </div>
      {isPdf ? (
        <iframe
          className="mt-5 h-[75vh] min-h-[28rem] w-full rounded-2xl border border-[#dde8e2] bg-muted"
          src={viewHref}
          title={viewerTitle}
        />
      ) : null}
    </section>
  );
}
