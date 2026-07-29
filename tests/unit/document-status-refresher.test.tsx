import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import {
  DOCUMENT_STATUS_REFRESH_INTERVAL_MS,
  DocumentStatusRefresher,
} from "@/components/documents/document-status-refresher";

describe("document status refresher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes while document work is pending and stops after it reaches a terminal state", () => {
    const view = render(<DocumentStatusRefresher active />);
    expect(mocks.refresh).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(DOCUMENT_STATUS_REFRESH_INTERVAL_MS);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);

    view.rerender(<DocumentStatusRefresher active={false} />);
    act(() => {
      vi.advanceTimersByTime(DOCUMENT_STATUS_REFRESH_INTERVAL_MS * 2);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
});
