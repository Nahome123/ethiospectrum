export type ServiceActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; url?: string };

export const initialServiceActionState: ServiceActionState = { status: "idle" };

export type RequestDocumentActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; documentId: string; storagePath: string; uploadToken: string }
  | { status: "complete"; documentId: string };

export const initialRequestDocumentActionState: RequestDocumentActionState = { status: "idle" };

/** Database SQLSTATE -> `services.errors.*` translation key. */
export function serviceErrorKey(code: string | undefined): string {
  switch (code) {
    case "42501":
      return "denied";
    case "40001":
    case "ES412":
      return "stale";
    case "55000":
      return "state";
    case "54000":
      return "limit";
    case "ES402":
      return "paymentRequired";
    case "ES409":
      return "conflict";
    case "ES410":
      return "rescheduleLimit";
    case "ES422":
      return "feesRequired";
    case "22007":
    case "22008":
      return "timezoneTime";
    case "22023":
    case "23514":
    case "23502":
      return "validation";
    default:
      return "generic";
  }
}
