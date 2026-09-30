import "server-only";
import { revalidatePath } from "next/cache";
import type { AppLocale } from "@/i18n/routing";

/** Every surface that renders a service request or its derived counts. */
export function revalidateServiceRequest(locale: AppLocale, requestId?: string) {
  revalidatePath(`/${locale}/dashboard`);
  revalidatePath(`/${locale}/requests`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/service-requests`);
  revalidatePath(`/${locale}/admin/payments`);
  revalidatePath(`/${locale}/specialist`);
  if (requestId) {
    revalidatePath(`/${locale}/requests/${requestId}`);
    revalidatePath(`/${locale}/admin/service-requests/${requestId}`);
    revalidatePath(`/${locale}/specialist/requests/${requestId}`);
  }
}
