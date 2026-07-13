import type { Metadata } from "next";
import "./globals.css";
import { brandConfig } from "@/config/brand";

export const metadata: Metadata = {
  applicationName: brandConfig.name,
  title: { default: brandConfig.defaultTitle, template: brandConfig.titleTemplate },
  description: brandConfig.description,
  icons: { icon: brandConfig.faviconPath },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
