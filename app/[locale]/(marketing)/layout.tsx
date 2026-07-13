import { PublicShell } from "@/components/layout/public-shell";
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell>{children}</PublicShell>;
}
