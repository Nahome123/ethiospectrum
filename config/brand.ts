export const brandConfig = {
  name: "Ethiospectrum",
  tagline: "Clear guidance for every family, in every language.",
  description:
    "Support for families of children with special needs, in English, Amharic, and Spanish: RBT Boot Camp training, consultations, IEP language assistance, and free parent support.",
  defaultTitle: "Ethiospectrum",
  titleTemplate: "%s | Ethiospectrum",
  supportEmail: "support@example.com",
  logoPath: "/images/logo/logo1.png",
  faviconPath: "/favicon.ico",
  openGraphImagePath: "/images/og-image.png",
} as const;

export type BrandConfig = typeof brandConfig;
