import type { Metadata } from "next";
import { Inter, Noto_Sans_Ethiopic, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { brandConfig } from "@/config/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ethiopic",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: brandConfig.name,
  title: { default: brandConfig.defaultTitle, template: brandConfig.titleTemplate },
  description: brandConfig.description,
  icons: { icon: brandConfig.faviconPath },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${grotesk.variable} ${ethiopic.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
