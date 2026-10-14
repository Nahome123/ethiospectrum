"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A password field with an eye button that shows or hides what was typed. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const t = useTranslations("authentication");
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input className={cn("pr-11", className)} type={visible ? "text" : "password"} {...props} />
      <button
        aria-controls={props.id}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
        onClick={() => setVisible((value) => !value)}
        type="button"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
