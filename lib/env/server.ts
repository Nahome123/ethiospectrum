import "server-only";
import { z } from "zod";
import {
  getPublicSupabaseEnv,
  parsePublicSupabaseEnv,
  type PublicSupabaseEnv,
  SupabaseConfigurationError,
} from "./client";

type EnvInput = Record<string, string | undefined>;

const optionalServiceRoleKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalDocumentProcessingSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalOpenAiApiKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalOpenAiSummaryModel = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
);

const optionalDocumentSummarySecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalOpenAiQuestionModel = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
);

const optionalDocumentQuestionSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalOcrProvider = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.enum(["openai"]).optional(),
);

const optionalOcrApiKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalOcrModel = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
);

const optionalDocumentOcrSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalReminderWorkerSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalStripeSecretKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^sk_(?:test|live)_[A-Za-z0-9]+$/)
    .optional(),
);

const optionalStripeWebhookSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^whsec_[A-Za-z0-9]+$/)
    .optional(),
);

const optionalStripePriceId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/)
    .optional(),
);

export interface ServerSupabaseEnv extends PublicSupabaseEnv {
  secretKey?: string;
}

export interface SupabaseAdminEnv extends PublicSupabaseEnv {
  secretKey: string;
}

export interface OpenAiSummaryEnv {
  apiKey: string;
  model: string;
}

export interface OpenAiQuestionEnv {
  apiKey: string;
  model: string;
}

export interface OcrProviderEnv {
  provider: "openai";
  apiKey: string;
  model: string;
}

export interface StripeBillingEnv {
  secretKey: string;
  webhookSecret: string;
  /** Recurring monthly Price for RBT Boot Camp; one-time services work without it. */
  rbtMonthlyPriceId: string | undefined;
  /** Delegates tax calculation to Stripe Tax where it is enabled on the account. */
  automaticTax: boolean;
}

export interface NotificationEmailEnv {
  apiKey: string;
  from: string;
}

export function parseServerSupabaseEnv(input: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = parsePublicSupabaseEnv(input);
  const secretKey = optionalServiceRoleKey.parse(input.SUPABASE_SECRET_KEY);

  if (!publicEnv) {
    if (secretKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SECRET_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, secretKey };
}

export function getServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = getPublicSupabaseEnv(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  );
  const secretKey = optionalServiceRoleKey.parse(
    input?.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY,
  );

  if (!publicEnv) {
    if (secretKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SECRET_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, secretKey };
}

export function requireServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv {
  const env = getServerSupabaseEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured for this development environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using Supabase features.",
    );
  }
  return env;
}

export function requireSupabaseAdminEnv(input?: EnvInput): SupabaseAdminEnv {
  const env = requireServerSupabaseEnv(input);
  if (!env.secretKey) {
    throw new SupabaseConfigurationError(
      "SUPABASE_SECRET_KEY is required for controlled server-side administrative Supabase operations.",
    );
  }
  return { ...env, secretKey: env.secretKey };
}

/** Separate internal-invocation secret; never reuse the Supabase service key. */
export function getDocumentProcessingSecret(input?: EnvInput): string | undefined {
  return optionalDocumentProcessingSecret.parse(
    input?.DOCUMENT_PROCESSING_SECRET ?? process.env.DOCUMENT_PROCESSING_SECRET,
  );
}

export function requireDocumentProcessingSecret(input?: EnvInput): string {
  const secret = getDocumentProcessingSecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_PROCESSING_SECRET is required for controlled document-processing invocation.",
    );
  }
  return secret;
}

/** Server-only provider configuration for bounded document summaries. */
export function getOpenAiSummaryEnv(input?: EnvInput): OpenAiSummaryEnv | undefined {
  const apiKey = optionalOpenAiApiKey.parse(input?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
  const model = optionalOpenAiSummaryModel.parse(
    input?.OPENAI_SUMMARY_MODEL ?? process.env.OPENAI_SUMMARY_MODEL,
  );

  if (!apiKey && !model) return undefined;
  if (!apiKey || !model) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL must be configured together for document summaries.",
    );
  }
  return { apiKey, model };
}

export function requireOpenAiSummaryEnv(input?: EnvInput): OpenAiSummaryEnv {
  const env = getOpenAiSummaryEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL are required for controlled document summaries.",
    );
  }
  return env;
}

/** Server-only provider configuration for bounded, source-grounded document Q&A. */
export function getOpenAiQuestionEnv(input?: EnvInput): OpenAiQuestionEnv | undefined {
  const apiKey = optionalOpenAiApiKey.parse(input?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
  const model = optionalOpenAiQuestionModel.parse(
    input?.OPENAI_QUESTION_MODEL ?? process.env.OPENAI_QUESTION_MODEL,
  );

  if (!apiKey && !model) return undefined;
  if (!apiKey || !model) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_QUESTION_MODEL must be configured together for document questions.",
    );
  }
  return { apiKey, model };
}

export function requireOpenAiQuestionEnv(input?: EnvInput): OpenAiQuestionEnv {
  const env = getOpenAiQuestionEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_QUESTION_MODEL are required for document questions.",
    );
  }
  return env;
}

/** Separate internal-invocation secret; never reuse processing or Supabase secrets. */
export function getDocumentSummarySecret(input?: EnvInput): string | undefined {
  return optionalDocumentSummarySecret.parse(
    input?.DOCUMENT_SUMMARY_SECRET ?? process.env.DOCUMENT_SUMMARY_SECRET,
  );
}

export function requireDocumentSummarySecret(input?: EnvInput): string {
  const secret = getDocumentSummarySecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_SUMMARY_SECRET is required for controlled document-summary invocation.",
    );
  }
  return secret;
}

/** Separate internal-invocation secret; never reuse processing, summary, or Supabase secrets. */
export function getDocumentQuestionSecret(input?: EnvInput): string | undefined {
  return optionalDocumentQuestionSecret.parse(
    input?.DOCUMENT_QUESTION_SECRET ?? process.env.DOCUMENT_QUESTION_SECRET,
  );
}

export function requireDocumentQuestionSecret(input?: EnvInput): string {
  const secret = getDocumentQuestionSecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_QUESTION_SECRET is required for controlled document-question invocation.",
    );
  }
  return secret;
}

/** Server-only OCR provider configuration. All values are required together. */
export function getOcrProviderEnv(input?: EnvInput): OcrProviderEnv | undefined {
  const provider = optionalOcrProvider.parse(input?.OCR_PROVIDER ?? process.env.OCR_PROVIDER);
  const apiKey = optionalOcrApiKey.parse(input?.OCR_API_KEY ?? process.env.OCR_API_KEY);
  const model = optionalOcrModel.parse(input?.OCR_MODEL ?? process.env.OCR_MODEL);

  if (!provider && !apiKey && !model) return undefined;
  if (!provider || !apiKey || !model) {
    throw new SupabaseConfigurationError(
      "OCR_PROVIDER, OCR_API_KEY, and OCR_MODEL must be configured together for document OCR.",
    );
  }
  return { provider, apiKey, model };
}

export function requireOcrProviderEnv(input?: EnvInput): OcrProviderEnv {
  const env = getOcrProviderEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "OCR_PROVIDER, OCR_API_KEY, and OCR_MODEL are required for controlled document OCR.",
    );
  }
  return env;
}

/** Separate internal-invocation secret; never reuse processing, summary, or Supabase secrets. */
export function getDocumentOcrSecret(input?: EnvInput): string | undefined {
  return optionalDocumentOcrSecret.parse(input?.DOCUMENT_OCR_SECRET ?? process.env.DOCUMENT_OCR_SECRET);
}

export function requireDocumentOcrSecret(input?: EnvInput): string {
  const secret = getDocumentOcrSecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_OCR_SECRET is required for controlled document-OCR invocation.",
    );
  }
  return secret;
}

/** Separate internal-invocation secret for in-app reminder delivery. */
export function getReminderWorkerSecret(input?: EnvInput): string | undefined {
  return optionalReminderWorkerSecret.parse(
    input?.REMINDER_WORKER_SECRET ?? process.env.REMINDER_WORKER_SECRET,
  );
}

/**
 * Server-only Stripe configuration. The secret key and webhook secret are
 * required together; the RBT Boot Camp monthly Price is optional so one-time
 * service payments can be enabled before the subscription product exists.
 */
export function getStripeBillingEnv(input?: EnvInput): StripeBillingEnv | undefined {
  const secretKey = optionalStripeSecretKey.parse(input?.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY);
  const webhookSecret = optionalStripeWebhookSecret.parse(
    input?.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET,
  );
  const rbtMonthlyPriceId = optionalStripePriceId.parse(
    input?.STRIPE_RBT_MONTHLY_PRICE_ID ?? process.env.STRIPE_RBT_MONTHLY_PRICE_ID,
  );
  const automaticTax =
    (input?.STRIPE_AUTOMATIC_TAX ?? process.env.STRIPE_AUTOMATIC_TAX ?? "").trim() === "true";

  if (!secretKey && !webhookSecret && !rbtMonthlyPriceId) {
    return undefined;
  }
  if (!secretKey || !webhookSecret) {
    throw new SupabaseConfigurationError(
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.",
    );
  }
  return { secretKey, webhookSecret, rbtMonthlyPriceId, automaticTax };
}

const optionalNotificationWorkerSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

export function getNotificationWorkerSecret(input?: EnvInput): string | undefined {
  return optionalNotificationWorkerSecret.parse(
    input?.NOTIFICATION_WORKER_SECRET ?? process.env.NOTIFICATION_WORKER_SECRET,
  );
}

/** Optional transactional email delivery (Resend). Without it, notifications stay in-app only. */
export function getNotificationEmailEnv(input?: EnvInput): NotificationEmailEnv | undefined {
  const apiKey = z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^re_[A-Za-z0-9_]+$/)
        .optional(),
    )
    .parse(input?.RESEND_API_KEY ?? process.env.RESEND_API_KEY);
  const from = z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(3).max(200).optional(),
    )
    .parse(input?.NOTIFICATION_EMAIL_FROM ?? process.env.NOTIFICATION_EMAIL_FROM);
  if (!apiKey && !from) return undefined;
  if (!apiKey || !from) {
    throw new SupabaseConfigurationError(
      "RESEND_API_KEY and NOTIFICATION_EMAIL_FROM must be configured together.",
    );
  }
  return { apiKey, from };
}

const stripeEnvFormats = [
  ["STRIPE_SECRET_KEY", /^sk_(?:test|live)_/, "sk_test_ or sk_live_"],
  ["STRIPE_WEBHOOK_SECRET", /^whsec_/, "whsec_"],
  ["STRIPE_RBT_MONTHLY_PRICE_ID", /^price_/, "price_"],
] as const;

/**
 * Explains why the Stripe configuration is unusable, naming variables but never
 * their values, so a misconfigured deployment can be diagnosed from its logs.
 */
export function describeStripeBillingEnvProblems(input?: EnvInput): string[] {
  const problems: string[] = [];
  for (const [name, prefix, expected] of stripeEnvFormats) {
    const raw = input?.[name] ?? process.env[name];
    const value = raw?.trim() ?? "";
    if (!value) {
      if (name !== "STRIPE_RBT_MONTHLY_PRICE_ID") problems.push(`${name} is missing or empty`);
      continue;
    }
    if (!prefix.test(value)) {
      problems.push(`${name} does not start with ${expected} (found prefix "${value.split("_")[0]}_")`);
    } else if (!/^[a-z]+_(?:(?:test|live)_)?[A-Za-z0-9]+$/.test(value)) {
      problems.push(
        `${name} contains characters other than letters and digits (quotes, spaces, or line breaks?)`,
      );
    }
  }
  return problems;
}

export function requireStripeBillingEnv(input?: EnvInput): StripeBillingEnv {
  const env = getStripeBillingEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "Stripe billing configuration is required for controlled subscription operations.",
    );
  }
  return env;
}
