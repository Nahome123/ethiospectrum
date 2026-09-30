import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getNotificationWorkerSecret } from "@/lib/env/server";
import { deliverNotificationEmails } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = getNotificationWorkerSecret();
  const header = request.headers.get("authorization");
  const candidate =
    request.headers.get("x-notification-worker-secret") ??
    (header?.startsWith("Bearer ") ? header.slice(7) : null);
  if (!expected || !candidate) return false;
  const received = Buffer.from(candidate);
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

/**
 * Scheduled operations worker: queues appointment reminders and escalations,
 * then delivers a bounded batch of notification emails. Returns counts only.
 */
async function run(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });
  const admin = createSupabaseAdminClient();
  const reminders = await admin.rpc("queue_service_appointment_reminders");
  if (reminders.error) return new NextResponse(null, { status: 503 });
  try {
    const emails = await deliverNotificationEmails(admin, 25);
    return NextResponse.json({ remindersQueued: reminders.data ?? 0, ...emails });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

export async function POST(request: Request) {
  return run(request);
}

/** Vercel Cron issues GET requests with `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: Request) {
  return run(request);
}
