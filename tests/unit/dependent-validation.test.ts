import { describe, expect, it } from "vitest";
import { createDependentSchema } from "@/lib/validation/dependent";

const schema = () => createDependentSchema({ firstName: "first", birthYear: "year", text: "text" });
describe("dependent validation", () => {
  it("accepts multilingual names and normalizes empty optional values", () => {
    const result = schema().parse({
      firstName: "  ሚካኤል  ",
      lastName: "",
      preferredName: "",
      birthYear: "",
      schoolDistrict: "",
      gradeLevel: "",
      notes: "  ",
    });
    expect(result).toMatchObject({
      firstName: "ሚካኤል",
      lastName: null,
      preferredName: null,
      birthYear: null,
      notes: null,
    });
  });
  it("rejects a future birth year", () => {
    expect(
      schema().safeParse({
        firstName: "Ana",
        lastName: "",
        preferredName: "",
        birthYear: String(new Date().getUTCFullYear() + 1),
        schoolDistrict: "",
        gradeLevel: "",
        notes: "",
      }).success,
    ).toBe(false);
  });
});
