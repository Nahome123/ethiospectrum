import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "warning" | "success" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

const serviceTones: Record<string, Tone> = {
  pending_review: "info",
  assigned: "info",
  awaiting_availability: "info",
  awaiting_payment: "warning",
  appointment_proposed: "warning",
  appointment_confirmed: "success",
  in_progress: "success",
  completed: "neutral",
  payment_failed: "danger",
  cancelled: "neutral",
  reschedule_requested: "warning",
  declined: "danger",
  no_show: "danger",
};

const paymentTones: Record<string, Tone> = {
  unpaid: "neutral",
  pending: "warning",
  processing: "warning",
  paid: "success",
  failed: "danger",
  partially_refunded: "info",
  refunded: "info",
  requested: "warning",
  succeeded: "success",
  rejected: "neutral",
};

const appointmentTones: Record<string, Tone> = {
  none: "neutral",
  proposed: "warning",
  confirmed: "success",
  declined: "neutral",
  superseded: "neutral",
  cancelled: "neutral",
  completed: "neutral",
  no_show: "danger",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}

export async function ServiceStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("services.status");
  return <StatusPill label={t(status)} tone={serviceTones[status] ?? "neutral"} />;
}

export async function PaymentStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("services.paymentStatus");
  return <StatusPill label={t(status)} tone={paymentTones[status] ?? "neutral"} />;
}

export async function AppointmentStatusBadge({ status }: { status: string }) {
  const t = await getTranslations("services.appointmentStatus");
  return <StatusPill label={t(status)} tone={appointmentTones[status] ?? "neutral"} />;
}
