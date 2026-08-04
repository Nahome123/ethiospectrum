import type { SupportCategory, SupportStatus } from "./constants";
import {
  supportCategoryFilterSchema,
  supportPageSchema,
  supportStatusFilterSchema,
} from "@/lib/validation/support";

export type SupportQueryState = {
  status: SupportStatus | null;
  category: SupportCategory | null;
  page: number;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Normalizes untrusted URL state; unknown values reset to safe defaults. */
export function parseSupportQuery(
  searchParams: Record<string, string | string[] | undefined>,
): SupportQueryState {
  const status = supportStatusFilterSchema.safeParse(first(searchParams.status));
  const category = supportCategoryFilterSchema.safeParse(first(searchParams.category));
  const page = supportPageSchema.safeParse(first(searchParams.page));
  return {
    status: status.success ? status.data : null,
    category: category.success ? category.data : null,
    page: page.success ? page.data : 1,
  };
}

export function supportQueryString(query: SupportQueryState): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.page > 1) params.set("page", String(query.page));
  const value = params.toString();
  return value ? `?${value}` : "";
}
