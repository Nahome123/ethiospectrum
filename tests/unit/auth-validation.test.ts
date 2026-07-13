import { describe, expect, it } from "vitest";
import { createLoginSchema, createSignupSchema } from "@/lib/validation/auth";

const messages = { email: "email", password: "password", name: "name" };
describe("authentication schemas", () => {
  it("rejects invalid login input", () =>
    expect(createLoginSchema(messages).safeParse({ email: "bad", password: "short" }).success).toBe(false));
  it("accepts valid signup input", () =>
    expect(
      createSignupSchema(messages).safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        password: "long-enough",
      }).success,
    ).toBe(true));
});
