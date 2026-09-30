import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerComponentSupabaseClient: vi.fn() }));

import { localizedField, parseLearner, toVideoEmbed } from "@/lib/training/server";

describe("training video embeds", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789?dnt=1"],
  ])("converts %s to a privacy-preserving embed", (url, embed) => {
    expect(toVideoEmbed(url)).toBe(embed);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=<script>",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (url) => {
    expect(toVideoEmbed(url)).toBeNull();
  });
});

describe("training learners and localization", () => {
  it("tracks the member unless a dependent id is supplied", () => {
    expect(parseLearner(undefined)).toEqual({ type: "member" });
    expect(parseLearner("member")).toEqual({ type: "member" });
    expect(parseLearner("10000000-0000-4000-8000-000000000001")).toEqual({
      type: "dependent",
      dependentId: "10000000-0000-4000-8000-000000000001",
    });
    expect(parseLearner("'; drop table")).toEqual({ type: "member" });
  });

  it("falls back to English content", () => {
    const localized = { am: { title: "ርዕስ" } };
    expect(localizedField(localized, "am", "title", "Title")).toBe("ርዕስ");
    expect(localizedField(localized, "es", "title", "Title")).toBe("Title");
    expect(localizedField(localized, "en", "title", "Title")).toBe("Title");
  });
});
