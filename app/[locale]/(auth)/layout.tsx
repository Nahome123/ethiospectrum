import { PublicShell } from "@/components/layout/public-shell";
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PublicShell>{children}</PublicShell>;
}
