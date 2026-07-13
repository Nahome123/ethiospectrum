import Image from "next/image";
import { cn } from "@/lib/utils";
import { brandConfig } from "@/config/brand";

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
  onDark?: boolean;
}

/** Shared presentation for the supplied horizontal Ethiospectrum logo asset. */
export function BrandLogo({ className, priority = false, onDark = false }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "relative block h-12 w-56 shrink-0 overflow-hidden",
        onDark && "rounded-md bg-white",
        className,
      )}
    >
      <Image
        src={brandConfig.logoPath}
        alt={brandConfig.name}
        fill
        priority={priority}
        sizes="(max-width: 640px) 192px, 224px"
        className="object-cover object-[center_47%]"
      />
    </span>
  );
}
