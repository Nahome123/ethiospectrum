export const brandConfig = {
  name: "Ethiospectrum",
  tagline: "Clear guidance for every family, in every language.",
  description:
    "A multilingual family-support platform that helps families organize important documents, understand complicated information, track next steps, and access guidance in English, Amharic, and Spanish.",
  defaultTitle: "Ethiospectrum",
  titleTemplate: "%s | Ethiospectrum",
  supportEmail: "support@example.com",
  logoPath: "/images/logo/logo1.png",
  faviconPath: "/favicon.ico",
  openGraphImagePath: "/images/og-image.png",
} as const;

export type BrandConfig = typeof brandConfig;
