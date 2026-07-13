import { z } from "zod";

type EnvInput = Record<string, string | undefined>;

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const publicSupabaseSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalNonEmptyString,
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.NEXT_PUBLIC_SUPABASE_URL) !== Boolean(value.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      context.addIssue({
        code: "custom",
        message: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set together.",
      });
    }
  });

export interface PublicSupabaseEnv {
  url: string;
  anonKey: string;
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function parsePublicSupabaseEnv(input: EnvInput): PublicSupabaseEnv | undefined {
  const result = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: input.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: input.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw new SupabaseConfigurationError(
      "Supabase public configuration is invalid. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY together.",
    );
  }

  if (!result.data.NEXT_PUBLIC_SUPABASE_URL) {
    return undefined;
  }

  return {
    url: result.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

export function getPublicSupabaseEnv(input?: EnvInput): PublicSupabaseEnv | undefined {
  return parsePublicSupabaseEnv(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  );
}

export function requirePublicSupabaseEnv(input?: EnvInput): PublicSupabaseEnv {
  const env = getPublicSupabaseEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured for this development environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using Supabase features.",
    );
  }
  return env;
}
