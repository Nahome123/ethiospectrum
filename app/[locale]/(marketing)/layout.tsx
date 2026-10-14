import { PublicShell } from "@/components/layout/public-shell";

/** Refresh hourly so the RBT Boot Camp price follows the Stripe Price. */
export const revalidate = 3600;

export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell>{children}</PublicShell>;
}
