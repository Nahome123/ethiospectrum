import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasValidReminderWorkerSecret } from "@/lib/reminders/internal-secret";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidReminderWorkerSecret(request.headers.get("x-reminder-worker-secret"))) {
    return new NextResponse(null, { status: 401 });
  }
  let requestedLimit = 50;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    if (typeof body.limit === "number" && Number.isInteger(body.limit)) requestedLimit = body.limit;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const workerRunId = randomUUID();
  const claimed = await admin.rpc("claim_due_reminders", {
    worker_run_id: workerRunId,
    requested_limit: Math.min(Math.max(requestedLimit, 1), 50),
  });
  if (claimed.error || !claimed.data) return new NextResponse(null, { status: 503 });
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;
  for (const reminder of claimed.data) {
    try {
      const classification = await admin.rpc("classify_reminder_delivery", {
        target_reminder_id: reminder.reminder_id,
        worker_run_id: workerRunId,
      });
      if (classification.error || !classification.data) {
        const transition = await admin.rpc("fail_reminder_delivery", {
          target_reminder_id: reminder.reminder_id,
          worker_run_id: workerRunId,
          safe_error_code: "delivery_consistency_failed",
        });
        if (transition.data === "scheduled") retried += 1;
        if (transition.data === "failed") failed += 1;
        continue;
      }
      if (classification.data !== "deliver") {
        const transition = await admin.rpc("skip_reminder_delivery", {
          target_reminder_id: reminder.reminder_id,
          worker_run_id: workerRunId,
          safe_skip_code: classification.data,
        });
        if (!transition.error && transition.data) skipped += 1;
        continue;
      }
      const result = await admin.rpc("complete_reminder_delivery", {
        target_reminder_id: reminder.reminder_id,
        worker_run_id: workerRunId,
      });
      if (!result.error && result.data) {
        delivered += 1;
        continue;
      }
      const transition = await admin.rpc("fail_reminder_delivery", {
        target_reminder_id: reminder.reminder_id,
        worker_run_id: workerRunId,
        safe_error_code: "delivery_storage_failed",
      });
      if (transition.data === "scheduled") retried += 1;
      if (transition.data === "failed") failed += 1;
    } catch {
      const transition = await admin.rpc("fail_reminder_delivery", {
        target_reminder_id: reminder.reminder_id,
        worker_run_id: workerRunId,
        safe_error_code: "delivery_internal_failed",
      });
      if (transition.data === "scheduled") retried += 1;
      if (transition.data === "failed") failed += 1;
    }
  }
  return NextResponse.json({ claimed: claimed.data.length, delivered, retried, failed, skipped });
}
