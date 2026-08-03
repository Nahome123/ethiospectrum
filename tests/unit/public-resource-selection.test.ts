import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerComponentSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerComponentSupabaseClient: mocks.createServerComponentSupabaseClient,
}));

import { getResourceFallbackNoticeKey } from "@/lib/resources/public-selection";
import { getPublishedResource, getPublishedResources } from "@/lib/resources/server";

const privateFields = {
  id: "10000000-0000-4000-8000-000000000001",
  review_status: "approved",
  review_note: "internal review",
  submitted_by: "20000000-0000-4000-8000-000000000002",
  submitted_at: "2026-08-01T00:00:00Z",
  reviewed_by: "30000000-0000-4000-8000-000000000003",
  reviewed_at: "2026-08-02T00:00:00Z",
  created_by: "40000000-0000-4000-8000-000000000004",
  updated_by: "50000000-0000-4000-8000-000000000005",
  published_by: "60000000-0000-4000-8000-000000000006",
  archived_by: null,
  version: 9,
  source_translation_version: 8,
  audits: [{ action: "approved" }],
  household_id: "70000000-0000-4000-8000-000000000007",
  dependent_id: "80000000-0000-4000-8000-000000000008",
  document_id: "90000000-0000-4000-8000-000000000009",
  reminder_id: "a0000000-0000-4000-8000-00000000000a",
};

function publicRow(locale: "en" | "am" | "es", fallback = false, index = 1) {
  return {
    ...privateFields,
    slug: `safe-resource-${index}`,
    category: "education",
    published_at: "2026-08-03T00:00:00Z",
    title: `${locale} title ${index}`,
    summary: `${locale} summary ${index}`,
    body: `${locale} body ${index}`,
    selected_locale: fallback ? "en" : locale,
    using_english_fallback: fallback,
  };
}

function clientWith(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  mocks.createServerComponentSupabaseClient.mockResolvedValue({ rpc });
  return rpc;
}

describe("public resource reader adapters", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["en", false, "en"],
    ["am", false, "am"],
    ["es", false, "es"],
    ["am", true, "en"],
    ["es", true, "en"],
  ] as const)("maps a %s catalog selection with fallback=%s", async (requested, fallback, selected) => {
    const rpc = clientWith([publicRow(requested, fallback)]);
    const result = await getPublishedResources(requested);
    expect(rpc).toHaveBeenCalledWith("list_published_resources", {
      input_locale: requested,
      input_category: undefined,
    });
    expect(result).toEqual([
      {
        slug: "safe-resource-1",
        category: "education",
        published_at: "2026-08-03T00:00:00Z",
        title: `${requested} title 1`,
        summary: `${requested} summary 1`,
        selectedLocale: selected,
        usingEnglishFallback: fallback,
      },
    ]);
  });

  it.each([
    ["en", false, "en"],
    ["am", false, "am"],
    ["es", false, "es"],
    ["am", true, "en"],
    ["es", true, "en"],
  ] as const)("maps a %s detail selection with fallback=%s", async (requested, fallback, selected) => {
    const rpc = clientWith([publicRow(requested, fallback)]);
    const result = await getPublishedResource("safe-resource-1", requested);
    expect(rpc).toHaveBeenCalledWith("get_published_resource", {
      input_slug: "safe-resource-1",
      input_locale: requested,
    });
    expect(result).toEqual({
      slug: "safe-resource-1",
      category: "education",
      published_at: "2026-08-03T00:00:00Z",
      title: `${requested} title 1`,
      summary: `${requested} summary 1`,
      body: `${requested} body 1`,
      selectedLocale: selected,
      usingEnglishFallback: fallback,
    });
  });

  it("allowlists catalog and detail properties instead of exposing workflow metadata", async () => {
    clientWith([publicRow("am")]);
    const catalog = await getPublishedResources("am");
    clientWith([publicRow("am")]);
    const detail = await getPublishedResource("safe-resource-1", "am");
    expect(Object.keys(catalog[0]!).sort()).toEqual(
      [
        "category",
        "published_at",
        "selectedLocale",
        "slug",
        "summary",
        "title",
        "usingEnglishFallback",
      ].sort(),
    );
    expect(Object.keys(detail!).sort()).toEqual(
      [
        "body",
        "category",
        "published_at",
        "selectedLocale",
        "slug",
        "summary",
        "title",
        "usingEnglishFallback",
      ].sort(),
    );
    for (const field of Object.keys(privateFields)) {
      expect(catalog[0]).not.toHaveProperty(field);
      expect(detail).not.toHaveProperty(field);
    }
  });

  it("returns safe empty and not-found results", async () => {
    clientWith(null);
    await expect(getPublishedResources("en")).resolves.toEqual([]);
    clientWith([]);
    await expect(getPublishedResource("unknown-resource", "en")).resolves.toBeNull();
  });

  it("forwards category filters and bounds catalog pagination", async () => {
    const rows = Array.from({ length: 55 }, (_, index) => publicRow("en", false, index + 1));
    const rpc = clientWith(rows);
    const secondPage = await getPublishedResources("en", "education", "2");
    expect(rpc).toHaveBeenCalledWith("list_published_resources", {
      input_locale: "en",
      input_category: "education",
    });
    expect(secondPage).toHaveLength(24);
    expect(secondPage[0]?.slug).toBe("safe-resource-25");
    clientWith(rows);
    const invalidPage = await getPublishedResources("en", undefined, "invalid");
    expect(invalidPage).toHaveLength(24);
    expect(invalidPage[0]?.slug).toBe("safe-resource-1");
  });
});

describe("localized resource fallback notices", () => {
  it("selects only the notice for an actual English fallback", () => {
    expect(getResourceFallbackNoticeKey("en", false)).toBeNull();
    expect(getResourceFallbackNoticeKey("en", true)).toBeNull();
    expect(getResourceFallbackNoticeKey("am", false)).toBeNull();
    expect(getResourceFallbackNoticeKey("es", false)).toBeNull();
    expect(getResourceFallbackNoticeKey("am", true)).toBe("amharicFallbackNotice");
    expect(getResourceFallbackNoticeKey("es", true)).toBe("spanishFallbackNotice");
    expect(getResourceFallbackNoticeKey("fr", true)).toBeNull();
  });

  it("keeps fallback keys aligned and explicitly identifies English", () => {
    const messages = ["en", "am", "es"].map(
      (locale) => JSON.parse(readFile(locale)) as { resourceWorkflow: Record<string, string> },
    );
    for (const catalog of messages) {
      expect(catalog.resourceWorkflow).toHaveProperty("amharicFallbackNotice");
      expect(catalog.resourceWorkflow).toHaveProperty("spanishFallbackNotice");
    }
    expect(messages[0]!.resourceWorkflow.amharicFallbackNotice).toContain("English version is shown");
    expect(messages[0]!.resourceWorkflow.spanishFallbackNotice).toContain("English version is shown");
  });
});

function readFile(locale: string): string {
  return readFileSync(`messages/${locale}.json`, "utf8");
}
