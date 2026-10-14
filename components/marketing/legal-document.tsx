import type { LegalDocument } from "@/lib/legal/documents";

/** A Terms or Privacy document: summary, a table of contents, then numbered sections. */
export function LegalDocumentView({
  contentsLabel,
  document,
  draftNotice,
  englishOnlyNotice,
  lastUpdatedLabel,
  title,
}: {
  contentsLabel: string;
  document: LegalDocument;
  draftNotice: string;
  /** Shown above the text when the page is viewed in another language. */
  englishOnlyNotice?: string;
  lastUpdatedLabel: string;
  title: string;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{lastUpdatedLabel}</p>
      <p className="mt-4 rounded-xl border border-border bg-secondary p-4 text-sm font-medium">
        {draftNotice}
      </p>
      {englishOnlyNotice ? (
        <p className="mt-3 rounded-xl border border-border bg-tint p-4 text-sm font-medium">
          {englishOnlyNotice}
        </p>
      ) : null}

      <div lang="en">
        <p className="mt-8 text-lg leading-8 text-foreground">{document.summary}</p>

        <nav aria-labelledby="legal-contents" className="mt-8 rounded-2xl border border-border bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground" id="legal-contents">
            {contentsLabel}
          </h2>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {document.sections.map((section) => (
              <li key={section.id}>
                <a
                  className="font-medium text-link underline-offset-4 hover:underline"
                  href={`#${section.id}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {document.sections.map((section) => (
            <section
              aria-labelledby={`${section.id}-heading`}
              className="scroll-mt-24"
              id={section.id}
              key={section.id}
            >
              <h2 className="text-xl font-bold text-foreground" id={`${section.id}-heading`}>
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 leading-7 text-muted-foreground">
                {section.blocks.map((block, index) =>
                  Array.isArray(block) ? (
                    <ul className="list-disc space-y-1.5 pl-6" key={`${section.id}-${index}`}>
                      {block.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={`${section.id}-${index}`}>{block}</p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
