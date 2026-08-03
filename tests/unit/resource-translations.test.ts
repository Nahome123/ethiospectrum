import { describe, expect, it } from "vitest";
import {
  resourceTranslationBodySchema,
  resourceTranslationCreateSchema,
  resourceTranslationLocaleSchema,
  resourceTranslationRejectionNoteSchema,
  resourceTranslationRejectionSchema,
  resourceTranslationSummarySchema,
  resourceTranslationTitleSchema,
  resourceTranslationTransitionSchema,
  resourceTranslationUiLocaleSchema,
  resourceTranslationUpdateSchema,
} from "@/lib/validation/resource-translations";

const resourceId = "00000000-0000-4000-8000-000000000001";
const translationId = "00000000-0000-4000-8000-000000000002";
const valid = {
  resourceId,
  locale: "am",
  title: "የትርጉም ርዕስ",
  summary: "ይህ በቂ ርዝመት ያለው የትርጉም ማጠቃለያ ነው።",
  body: "ይህ የማርክዳውን ይዘት ነው፣ እና ከሃምሳ ቁምፊዎች በላይ በመሆኑ ትክክለኛ የትርጉም ይዘት ነው።",
};

function expectBounds(
  schema: { safeParse(value: unknown): { success: boolean }; parse(value: unknown): string },
  minimum: number,
  maximum: number,
) {
  expect(schema.safeParse("x".repeat(minimum)).success).toBe(true);
  expect(schema.safeParse("x".repeat(maximum)).success).toBe(true);
  expect(schema.safeParse("x".repeat(minimum - 1)).success).toBe(false);
  expect(schema.safeParse("x".repeat(maximum + 1)).success).toBe(false);
  expect(schema.safeParse(" ".repeat(minimum)).success).toBe(false);
  expect(schema.parse(`  ${"x".repeat(minimum)}  `)).toBe("x".repeat(minimum));
}

describe("resource translation locale validation", () => {
  it.each(["am", "es"])("accepts the %s mutation locale", (locale) => {
    expect(resourceTranslationLocaleSchema.safeParse(locale).success).toBe(true);
  });

  it.each(["en", "fr", "de", "", "  ", "arbitrary", null, undefined])(
    "rejects the unsupported mutation locale %j",
    (locale) => {
      expect(resourceTranslationLocaleSchema.safeParse(locale).success).toBe(false);
    },
  );

  it("keeps the UI locale set separate from the mutation locale set", () => {
    expect(resourceTranslationUiLocaleSchema.safeParse("en").success).toBe(true);
    expect(resourceTranslationUiLocaleSchema.safeParse("am").success).toBe(true);
    expect(resourceTranslationUiLocaleSchema.safeParse("es").success).toBe(true);
    expect(resourceTranslationUiLocaleSchema.safeParse("fr").success).toBe(false);
  });
});

describe("resource translation content validation", () => {
  it("enforces title bounds and trimming", () => {
    expectBounds(resourceTranslationTitleSchema, 3, 160);
  });

  it("enforces summary bounds and trimming", () => {
    expectBounds(resourceTranslationSummarySchema, 10, 500);
  });

  it("enforces body bounds and trimming", () => {
    expectBounds(resourceTranslationBodySchema, 50, 50_000);
  });

  it("accepts Amharic, accented Spanish, and Markdown", () => {
    expect(resourceTranslationTitleSchema.safeParse("የቤተሰብ መመሪያ").success).toBe(true);
    expect(resourceTranslationSummarySchema.safeParse("Guía práctica para familias.").success).toBe(true);
    expect(
      resourceTranslationBodySchema.safeParse(
        "## Guía práctica\n\nEste contenido con **énfasis** ofrece orientación suficientemente detallada.",
      ).success,
    ).toBe(true);
    expect(resourceTranslationBodySchema.safeParse(valid.body).success).toBe(true);
  });

  it("enforces rejection-note presence, bounds, and trimming", () => {
    expectBounds(resourceTranslationRejectionNoteSchema, 10, 1_000);
    expect(resourceTranslationRejectionNoteSchema.safeParse(undefined).success).toBe(false);
    expect(resourceTranslationRejectionNoteSchema.safeParse(null).success).toBe(false);
    expect(resourceTranslationRejectionNoteSchema.parse("  Needs work  ")).toBe("Needs work");
  });
});

describe("resource translation mutation schemas", () => {
  it("accepts supported Unicode Amharic and Spanish drafts", () => {
    expect(resourceTranslationCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      resourceTranslationCreateSchema.safeParse({
        ...valid,
        locale: "es",
        title: "Guía para familias",
        summary: "Este resumen en español tiene longitud suficiente.",
        body: "Este cuerpo en español contiene información suficientemente detallada para superar el mínimo requerido.",
      }).success,
    ).toBe(true);
  });

  it("requires optimistic-concurrency versions for update and transitions", () => {
    const update = { translationId, title: valid.title, summary: valid.summary, body: valid.body };
    expect(resourceTranslationUpdateSchema.safeParse(update).success).toBe(false);
    expect(resourceTranslationUpdateSchema.safeParse({ ...update, expectedVersion: 3 }).success).toBe(true);
    expect(resourceTranslationTransitionSchema.safeParse({ translationId }).success).toBe(false);
    expect(resourceTranslationTransitionSchema.safeParse({ translationId, expectedVersion: 3 }).success).toBe(
      true,
    );
  });

  it("requires a valid rejection note", () => {
    const transition = { translationId, expectedVersion: 2 };
    expect(resourceTranslationRejectionSchema.safeParse(transition).success).toBe(false);
    expect(
      resourceTranslationRejectionSchema.safeParse({ ...transition, rejectionNote: "too short" }).success,
    ).toBe(false);
    expect(
      resourceTranslationRejectionSchema.safeParse({ ...transition, rejectionNote: "A clear review note." })
        .success,
    ).toBe(true);
  });

  it.each([
    "actorUserId",
    "submitterUserId",
    "reviewerUserId",
    "reviewStatus",
    "resourceStatus",
    "sourceTranslationVersion",
    "createdAt",
    "updatedAt",
    "reviewedAt",
    "auditAction",
  ])("rejects the privileged create field %s", (field) => {
    expect(resourceTranslationCreateSchema.safeParse({ ...valid, [field]: "forged" }).success).toBe(false);
  });

  it.each([
    "locale",
    "resourceId",
    "actorUserId",
    "reviewerUserId",
    "reviewStatus",
    "sourceTranslationVersion",
    "reviewedAt",
  ])("rejects the privileged update field %s", (field) => {
    expect(
      resourceTranslationUpdateSchema.safeParse({
        translationId,
        expectedVersion: 1,
        title: valid.title,
        summary: valid.summary,
        body: valid.body,
        [field]: "forged",
      }).success,
    ).toBe(false);
  });
});
