import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  paymentStatus: vi.fn(),
  startPayment: vi.fn(),
  listOpenSlots: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.paymentStatus }) }) }),
  })),
}));
vi.mock("@/lib/services/payment-actions", () => ({ startServicePaymentAction: mocks.startPayment }));
vi.mock("@/lib/services/booking", () => ({
  selfScheduledServiceTypes: ["consultation", "parent_support"],
  listOpenSlots: mocks.listOpenSlots,
}));
vi.mock("@/lib/services/revalidate", () => ({ revalidateServiceRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

import { SlotBookingForm } from "@/components/services/slot-booking-form";
import { bookServiceSlotAction, loadOpenSlotsAction } from "@/lib/services/booking-actions";

const requestId = "11111111-1111-4111-8111-111111111111";
const milka = "22222222-2222-4222-8222-222222222222";
const yamrot = "33333333-3333-4333-8333-333333333333";
const idle = { status: "idle" } as const;

function booking(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    serviceType: "consultation",
    dependentId: "44444444-4444-4444-8444-444444444444",
    description: "We need help with morning routines.",
    relevantInformation: "",
    category: "general_guidance",
    topicKey: "",
    language: "en",
    specialistId: milka,
    startAt: "2026-11-02T15:00:00.000Z",
    timezone: "America/Chicago",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    ...values,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("booking an open time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: requestId, error: null });
  });

  it("books the slot and goes straight to Checkout for a paid consultation", async () => {
    mocks.paymentStatus.mockResolvedValue({ data: { payment_status: "unpaid" } });
    mocks.startPayment.mockResolvedValue({
      status: "success",
      message: "",
      url: "https://checkout.stripe.test/x",
    });
    const result = await bookServiceSlotAction("en", idle, booking());
    expect(mocks.rpc).toHaveBeenCalledWith(
      "book_service_slot",
      expect.objectContaining({
        input_service_type: "consultation",
        input_specialist_id: milka,
        input_start_at: "2026-11-02T15:00:00.000Z",
        input_timezone: "America/Chicago",
        input_consultation_category: "general_guidance",
      }),
    );
    expect(result).toEqual({ status: "success", message: "", url: "https://checkout.stripe.test/x" });
  });

  it("confirms a free Parent Support booking without payment", async () => {
    mocks.paymentStatus.mockResolvedValue({ data: { payment_status: "not_required" } });
    await expect(
      bookServiceSlotAction("am", idle, booking({ serviceType: "parent_support", category: "" })),
    ).rejects.toThrow(`REDIRECT:/am/requests/${requestId}?booked=1`);
    expect(mocks.startPayment).not.toHaveBeenCalled();
  });

  it("explains a time that was just taken, and the booking limit", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "ES409" } });
    expect(await bookServiceSlotAction("en", idle, booking())).toEqual({
      status: "error",
      message: "slotTaken",
    });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "ES429" } });
    expect(await bookServiceSlotAction("en", idle, booking())).toEqual({
      status: "error",
      message: "bookingLimit",
    });
  });

  it("asks for a time before calling the database", async () => {
    expect(await bookServiceSlotAction("en", idle, booking({ startAt: "", specialistId: "" }))).toEqual({
      status: "error",
      message: "chooseTime",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a consultation category but not for Parent Support", async () => {
    expect((await bookServiceSlotAction("en", idle, booking({ category: "" }))).status).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("loads open times only for self-scheduled services", async () => {
    mocks.listOpenSlots.mockResolvedValue([]);
    await loadOpenSlotsAction("consultation", "en", "any");
    expect(mocks.listOpenSlots).toHaveBeenCalledWith("consultation", "en", null);
    await loadOpenSlotsAction("consultation", "am", milka);
    expect(mocks.listOpenSlots).toHaveBeenLastCalledWith("consultation", "am", milka);
    expect(await loadOpenSlotsAction("iep_language_assistance", "en", "any")).toEqual([]);
  });
});

describe("booking form", () => {
  const specialists = [
    { id: milka, name: "Milka Abebe", bio: "BCBA candidate", languages: ["en", "am"] },
    { id: yamrot, name: "Yamrot Bekele", bio: null, languages: ["en"] },
  ];
  const slots = [
    { specialistId: milka, startAt: "2026-11-02T15:00:00.000Z", endAt: "2026-11-02T16:00:00.000Z" },
    { specialistId: yamrot, startAt: "2026-11-02T17:00:00.000Z", endAt: "2026-11-02T18:00:00.000Z" },
    { specialistId: milka, startAt: "2026-11-03T15:00:00.000Z", endAt: "2026-11-03T16:00:00.000Z" },
  ];

  it("offers Either plus each specialist, and enables booking once a time is chosen", async () => {
    render(
      <SlotBookingForm
        dependents={[{ id: "d1", name: "Lulit" }]}
        initialSlots={slots}
        locale="en"
        serviceType="consultation"
        specialists={specialists}
      />,
    );
    expect(screen.getByRole("radio", { name: /either/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Milka Abebe/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Yamrot Bekele/ })).toBeInTheDocument();
    const book = screen.getByRole("button", { name: "bookAndPay" });
    expect(book).toBeDisabled();
    const times = await screen.findAllByRole("button", { pressed: false });
    expect(times.length).toBe(3);
    fireEvent.click(times[1]);
    await waitFor(() => expect(book).toBeEnabled());
    const form = book.closest("form") as HTMLFormElement;
    expect((form.elements.namedItem("specialistId") as HTMLInputElement).value).toBe(yamrot);
    expect((form.elements.namedItem("startAt") as HTMLInputElement).value).toBe("2026-11-02T17:00:00.000Z");
  });

  it("names the only specialist for Parent Support and needs no category", () => {
    render(
      <SlotBookingForm
        dependents={[{ id: "d1", name: "Lulit" }]}
        initialSlots={[]}
        locale="en"
        serviceType="parent_support"
        specialists={[{ id: yamrot, name: "Yoftahe", bio: null, languages: ["en", "am"] }]}
      />,
    );
    expect(screen.queryByRole("radio", { name: /either/ })).toBeNull();
    expect(screen.getByText(/withSpecialist Yoftahe/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bookFree" })).toBeDisabled();
  });
});
