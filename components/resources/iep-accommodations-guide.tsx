import { IepAccommodationsProgress } from "@/components/resources/iep-accommodations-progress";
import { iepAccommodationsContent } from "@/features/resources/iep-accommodations/content";

export type IepAccommodationsLabels = {
  amharic: string;
  backToTop: string;
  contents: string;
  contentsDescription: string;
  contentsStatus: string;
  english: string;
  eyebrow: string;
  readingProgress: string;
  sectionStatus: (section: number, total: number) => string;
  sectionSummary: (section: number, count: number) => string;
};

export function IepAccommodationsGuide({ labels }: { labels: IepAccommodationsLabels }) {
  const content = iepAccommodationsContent;
  const progressSections = content.sections.map((section) => ({
    id: section.id,
    status: labels.sectionStatus(section.index, content.sections.length),
    title: section.title,
  }));

  return (
    <div className="space-y-6" dir="ltr">
      <IepAccommodationsProgress
        backToTop={labels.backToTop}
        contentsStatus={labels.contentsStatus}
        readingProgress={labels.readingProgress}
        sections={progressSections}
        title={content.title}
      />

      <header className="overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-sm sm:px-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/80">
          {labels.eyebrow}
        </p>
        <h1 className="mt-5 max-w-4xl font-heading text-3xl font-bold tracking-tight sm:text-5xl">
          {content.title}
        </h1>
        <p className="mt-3 max-w-4xl text-xl font-semibold text-primary-foreground/85" lang="am">
          {content.titleAm}
        </p>
        <div className="my-6 h-px max-w-2xl bg-primary-foreground/30" />
        <p className="max-w-3xl text-lg italic">{content.tagline}</p>
        <p className="mt-2 max-w-3xl text-base text-primary-foreground/85" lang="am">
          {content.taglineAm}
        </p>
        <p className="mt-7 max-w-3xl leading-7 text-primary-foreground/90">{content.introduction}</p>
        <p className="mt-3 max-w-3xl leading-7 text-primary-foreground/80" lang="am">
          {content.introductionAm}
        </p>
        <ul className="mt-7 flex flex-wrap gap-2">
          {content.stats.map((stat) => (
            <li
              className="rounded-full border border-primary-foreground/35 px-3 py-1 text-sm font-semibold"
              key={stat}
            >
              {stat}
            </li>
          ))}
        </ul>
      </header>

      <nav
        aria-label={labels.contents}
        className="rounded-3xl border border-border bg-secondary/35 p-5 sm:p-8"
      >
        <h2 className="font-heading text-2xl font-bold">{labels.contents}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.contentsDescription}</p>
        <ol className="mt-5 grid gap-2 md:grid-cols-2">
          {content.sections.map((section) => (
            <li key={section.id}>
              <a
                className="grid min-h-16 grid-cols-[2.5rem_1fr] items-start gap-x-2 rounded-xl border border-transparent p-3 hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                href={`#${section.id}`}
              >
                <span className="pt-1 text-xs font-bold tabular-nums text-secondary-foreground">
                  {String(section.index).padStart(2, "0")}
                </span>
                <span className="font-semibold">{section.title}</span>
                <span className="col-start-2 text-sm text-muted-foreground" lang="am">
                  {section.titleAm}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main className="space-y-12" id="iep-accommodations-content">
        {content.sections.map((section) => (
          <section className="scroll-mt-24" id={section.id} key={section.id}>
            <header className="mb-5 border-t-2 border-primary pt-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                {labels.sectionSummary(section.index, section.items.length)}
              </p>
              <h2 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">{section.title}</h2>
              <p className="mt-1 text-lg font-semibold text-primary" lang="am">
                {section.titleAm}
              </p>
            </header>
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
              <table className="w-full border-collapse">
                <thead className="sr-only md:table-header-group">
                  <tr className="bg-muted/60">
                    <th className="w-1/2 px-5 py-3 text-left text-xs uppercase tracking-[0.12em]" scope="col">
                      {labels.english}
                    </th>
                    <th className="w-1/2 px-5 py-3 text-left text-sm" lang="am" scope="col">
                      {labels.amharic}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, index) => (
                    <tr
                      className="block border-b border-border last:border-b-0 even:bg-muted/20 hover:bg-muted/40 md:table-row"
                      key={`${section.id}-${index}`}
                    >
                      <td className="block px-4 pb-2 pt-4 leading-7 md:table-cell md:w-1/2 md:border-r md:border-border md:px-5 md:py-4 md:align-top">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground md:hidden">
                          {labels.english}
                        </span>
                        {item.en}
                      </td>
                      <td
                        className="block px-4 pb-4 pt-1 leading-8 text-muted-foreground md:table-cell md:w-1/2 md:px-5 md:py-4 md:align-top"
                        lang="am"
                      >
                        <span className="mb-1 block text-sm font-bold text-muted-foreground md:hidden">
                          {labels.amharic}
                        </span>
                        {item.am}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-border py-5 text-sm italic text-muted-foreground">
        {content.colophon}
      </footer>
    </div>
  );
}
