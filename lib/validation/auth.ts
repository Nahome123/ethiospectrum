import { z } from "zod";

export const createLoginSchema = (messages: { email: string; password: string }) =>
  z.object({
    email: z.string().email(messages.email),
    password: z.string().min(8, messages.password),
  });

export const createSignupSchema = (messages: { email: string; password: string; name: string }) =>
  z.object({
    firstName: z.string().trim().min(2, messages.name),
    lastName: z.string().trim().min(2, messages.name),
    email: z.string().email(messages.email),
    password: z.string().min(8, messages.password),
  });

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
export type SignupInput = z.infer<ReturnType<typeof createSignupSchema>>;
