const localhostOrigin = "http://localhost:3000";

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const candidate = value.startsWith("http") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    localhostOrigin
  );
}
