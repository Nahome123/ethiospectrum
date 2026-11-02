/** Calendly's inline booking page, with an open-in-a-new-tab fallback. */
export function CalendlyEmbed({
  url,
  email,
  title,
  fallbackLabel,
}: {
  url: string;
  email?: string;
  title: string;
  fallbackLabel: string;
}) {
  const embed = new URL(url);
  embed.searchParams.set("embed_type", "Inline");
  embed.searchParams.set("hide_gdpr_banner", "1");
  if (email) embed.searchParams.set("email", email);
  return (
    <div>
      <iframe
        className="h-[700px] w-full rounded-xl border bg-white"
        loading="lazy"
        src={embed.toString()}
        title={title}
      />
      <p className="mt-2 text-sm text-muted-foreground">
        <a className="font-semibold text-link underline" href={url} rel="noopener noreferrer" target="_blank">
          {fallbackLabel}
        </a>
      </p>
    </div>
  );
}
