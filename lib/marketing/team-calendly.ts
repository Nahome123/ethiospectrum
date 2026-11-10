/**
 * The administrators' Calendly page behind "Talk to our team" on the home
 * page, from TEAM_CALENDLY_URL. Only a calendly.com link is used; anything
 * else (or nothing) returns null and the button opens the request form instead.
 */
export function teamCalendlyUrl(value: string | undefined = process.env.TEAM_CALENDLY_URL): string | null {
  const link = value?.trim();
  if (!link || link.length > 500 || !/^https:\/\/calendly\.com\/[A-Za-z0-9_./?=&%-]+$/.test(link))
    return null;
  return link;
}
