import { describe, expect, it } from "vitest";
import {
  createForgotPasswordSchema,
  createLoginSchema,
  createResetPasswordSchema,
  createSignupSchema,
} from "@/lib/validation/auth";

const messages = {
  email: "email",
  password: "password",
  name: "name",
  passwordMatch: "password match",
  terms: "terms",
};

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
        confirmPassword: "long-enough",
        termsAccepted: true,
      }).success,
    ).toBe(true));

  it("rejects mismatched passwords and a missing terms acknowledgement", () =>
    expect(
      createSignupSchema(messages).safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        password: "long-enough",
        confirmPassword: "different-password",
        termsAccepted: false,
      }).success,
    ).toBe(false));

  it("validates password recovery forms", () => {
    expect(createForgotPasswordSchema(messages).safeParse({ email: "bad" }).success).toBe(false);
    expect(
      createResetPasswordSchema(messages).safeParse({ password: "long-enough", confirmPassword: "different" })
        .success,
    ).toBe(false);
  });
});
