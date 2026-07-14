import { z } from "zod";

export const createLoginSchema = (messages: { email: string; password: string }) =>
  z.object({
    email: z.string().email(messages.email),
    password: z.string().min(8, messages.password),
  });

export const createSignupSchema = (messages: {
  email: string;
  password: string;
  name: string;
  passwordMatch: string;
  terms: string;
}) =>
  z
    .object({
      firstName: z.string().trim().min(2, messages.name),
      lastName: z.string().trim().min(2, messages.name),
      email: z.string().trim().email(messages.email),
      password: z.string().min(8, messages.password),
      confirmPassword: z.string().min(8, messages.password),
      termsAccepted: z.boolean().refine((value) => value, messages.terms),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: messages.passwordMatch,
      path: ["confirmPassword"],
    });

export const createForgotPasswordSchema = (messages: { email: string }) =>
  z.object({ email: z.string().trim().email(messages.email) });

export const createResetPasswordSchema = (messages: { password: string; passwordMatch: string }) =>
  z
    .object({
      password: z.string().min(8, messages.password),
      confirmPassword: z.string().min(8, messages.password),
    })
    .refine((value) => value.password === value.confirmPassword, {
      message: messages.passwordMatch,
      path: ["confirmPassword"],
    });

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
export type SignupInput = z.infer<ReturnType<typeof createSignupSchema>>;
export type ForgotPasswordInput = z.infer<ReturnType<typeof createForgotPasswordSchema>>;
export type ResetPasswordInput = z.infer<ReturnType<typeof createResetPasswordSchema>>;
