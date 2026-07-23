import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

export function createDependentSchema(messages: { firstName: string; birthYear: string; text: string }) {
  const currentYear = new Date().getUTCFullYear();
  return z.object({
    firstName: z.string().trim().min(1, messages.firstName).max(80, messages.text),
    lastName: optionalText(80),
    preferredName: optionalText(80),
    birthYear: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value)))
      .refine(
        (value) => value === null || (Number.isInteger(value) && value >= 1900 && value <= currentYear),
        messages.birthYear,
      ),
    schoolDistrict: optionalText(160),
    gradeLevel: optionalText(80),
    notes: optionalText(2000),
  });
}

export type DependentInput = z.infer<ReturnType<typeof createDependentSchema>>;
