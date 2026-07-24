import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerComponentSupabaseClient: vi.fn(),
  getDocumentContext: vi.fn(),
  canArchiveDocument: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerComponentSupabaseClient: mocks.createServerComponentSupabaseClient,
}));
vi.mock("@/lib/documents/server", () => ({
  getDocumentContext: mocks.getDocumentContext,
  canArchiveDocument: mocks.canArchiveDocument,
}));

import { getDocumentBinder, getDocumentDashboardSummary } from "@/lib/documents/binder-query";
import { parseDocumentBinderSearchParams } from "@/lib/validation/document-binder";

const householdId = "10000000-0000-4000-8000-000000000001";
const dependentId = "20000000-0000-4000-8000-000000000002";
const documentId = "30000000-0000-4000-8000-000000000003";

function documentContext() {
  return {
    household: { id: householdId, name: "Synthetic household" },
    userId: "40000000-0000-4000-8000-000000000004",
    permission: "member" as const,
    canUpload: true,
    canProcess: true,
  };
}

function binderDocument(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: documentId,
    dependent_id: dependentId,
    uploaded_by: "50000000-0000-4000-8000-000000000005",
    title: "Synthetic school report",
    original_filename: "synthetic-school-report.pdf",
    mime_type: "application/pdf",
    file_size: 1024,
    document_type: "education",
    processing_status: "not_started",
    upload_status: "uploaded",
    created_at: "2026-07-22T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function activeDependentsQuery(
  data: unknown[] = [{ id: dependentId, first_name: "Synthetic", preferred_name: null }],
) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(async () => ({ data, error: null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

function documentQuery(result: { data: unknown[]; count: number; error?: Error | null }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(async () => ({ data: result.data, count: result.count, error: result.error ?? null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.lt.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function summaryStatusQuery(result: { data?: unknown[]; error?: Error | null } = {}) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(async () => ({ data: result.data ?? [], error: result.error ?? null })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function binderClient({
  activeDependents = [{ id: dependentId, first_name: "Synthetic", preferred_name: null }],
  documents = [binderDocument()],
  count = 1,
  summaryRows = [],
}: {
  activeDependents?: unknown[];
  documents?: unknown[];
  count?: number;
  summaryRows?: unknown[];
} = {}) {
  const activeDependentsChain = activeDependentsQuery(activeDependents);
  const documentsChain = documentQuery({ data: documents, count });
  const summaryStatusChain = summaryStatusQuery({ data: summaryRows });
  const from = vi.fn((table: string) => {
    if (table === "dependents") return activeDependentsChain;
    if (table === "document_summaries") return summaryStatusChain;
    return documentsChain;
  });
  return { client: { from }, activeDependentsChain, documentsChain, summaryStatusChain, from };
}

function dashboardQuery(result: { count?: number; data?: unknown[]; error?: Error | null }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: <TResult1 = { count?: number; data?: unknown[]; error: Error | null }, TResult2 = never>(
      onfulfilled?:
        | ((value: {
            count?: number;
            data?: unknown[];
            error: Error | null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve({ ...result, error: result.error ?? null }).then(onfulfilled, onrejected),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function dashboardClient(results: { count?: number; data?: unknown[]; error?: Error | null }[]) {
  const queries = results.map(dashboardQuery);
  const pendingQueries = [...queries];
  const from = vi.fn(() => {
    const query = pendingQueries.shift();
    if (!query) throw new Error("Unexpected dashboard query");
    return query;
  });
  return { client: { from }, from, queries };
}

describe("document binder server query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocumentContext.mockResolvedValue(documentContext());
    mocks.canArchiveDocument.mockReturnValue(false);
  });

  it("fails closed before creating a database client when no active household context exists", async () => {
    mocks.getDocumentContext.mockResolvedValue(null);

    const result = await getDocumentBinder(parseDocumentBinderSearchParams({ q: "school" }));

    expect(result.context).toBeNull();
    expect(result.documents).toEqual([]);
    expect(mocks.createServerComponentSupabaseClient).not.toHaveBeenCalled();
  });

  it("preserves the server-derived viewer capability for the binder UI to hide uploads", async () => {
    const fixture = binderClient();
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);
    mocks.getDocumentContext.mockResolvedValue({
      ...documentContext(),
      permission: "viewer",
      canUpload: false,
    });

    const result = await getDocumentBinder(parseDocumentBinderSearchParams({}));

    expect(result.context?.canUpload).toBe(false);
  });

  it("always scopes default results to the verified household, excludes archives, and selects only UI metadata", async () => {
    const fixture = binderClient();
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    const result = await getDocumentBinder(
      parseDocumentBinderSearchParams({ q: "school report", sort: "title_asc" }),
    );

    expect(fixture.activeDependentsChain.eq).toHaveBeenCalledWith("household_id", householdId);
    expect(fixture.activeDependentsChain.is).toHaveBeenCalledWith("archived_at", null);
    expect(fixture.documentsChain.eq).toHaveBeenCalledWith("household_id", householdId);
    expect(fixture.documentsChain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(fixture.documentsChain.select).toHaveBeenCalledWith(expect.stringContaining("original_filename"), {
      count: "exact",
    });
    expect(fixture.documentsChain.select.mock.calls[0][0]).not.toContain("*");
    expect(fixture.documentsChain.select.mock.calls[0][0]).not.toContain("storage_path");
    expect(fixture.documentsChain.or).toHaveBeenCalledWith(
      "title.ilike.*school*report*,original_filename.ilike.*school*report*,document_type.ilike.*school*report*",
    );
    expect(fixture.documentsChain.order).toHaveBeenNthCalledWith(1, "title", { ascending: true });
    expect(fixture.documentsChain.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(fixture.documentsChain.range).toHaveBeenCalledWith(0, 11);
    expect(result.documents[0]).toMatchObject({ dependentName: "Synthetic", canArchive: false });
  });

  it("ignores a dependent UUID that is not an active dependent in the verified household", async () => {
    const foreignDependentId = "60000000-0000-4000-8000-000000000006";
    const fixture = binderClient({
      activeDependents: [],
      documents: [binderDocument({ dependent_id: null })],
    });
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    const result = await getDocumentBinder(
      parseDocumentBinderSearchParams({ dependent: foreignDependentId }),
    );

    expect(result.filters.dependentId).toBeNull();
    expect(fixture.documentsChain.eq).not.toHaveBeenCalledWith("dependent_id", foreignDependentId);
  });

  it("uses the household-level filter and safe controlled status/date filters", async () => {
    const fixture = binderClient();
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    await getDocumentBinder(
      parseDocumentBinderSearchParams({
        dependent: "unassigned",
        uploadStatus: "failed",
        processingStatus: "not_started",
        from: "2026-07-01",
        to: "2026-07-22",
      }),
    );

    expect(fixture.documentsChain.is).toHaveBeenCalledWith("dependent_id", null);
    expect(fixture.documentsChain.eq).toHaveBeenCalledWith("upload_status", "failed");
    expect(fixture.documentsChain.eq).toHaveBeenCalledWith("processing_status", "not_started");
    expect(fixture.documentsChain.gte).toHaveBeenCalledWith("created_at", "2026-07-01T00:00:00.000Z");
    expect(fixture.documentsChain.lt).toHaveBeenCalledWith("created_at", "2026-07-23T00:00:00.000Z");
  });

  it("returns deterministic server pagination metadata and clamps an out-of-range page safely", async () => {
    const fixture = binderClient({ documents: [binderDocument()], count: 13 });
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    const result = await getDocumentBinder(parseDocumentBinderSearchParams({ page: "9" }));

    expect(fixture.documentsChain.range).toHaveBeenNthCalledWith(1, 96, 107);
    expect(fixture.documentsChain.range).toHaveBeenNthCalledWith(2, 12, 23);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 12,
      totalCount: 13,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  it("cannot turn search or sorting values into arbitrary PostgREST filters or columns", async () => {
    const fixture = binderClient();
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    await getDocumentBinder(
      parseDocumentBinderSearchParams({
        q: "report),upload_status.eq.archived",
        sort: "storage_path",
      }),
    );

    const searchExpression = fixture.documentsChain.or.mock.calls[0][0] as string;
    expect(searchExpression).not.toContain("upload_status.eq");
    expect(searchExpression).not.toContain(")");
    expect(fixture.documentsChain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(fixture.documentsChain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("adds only a batched lifecycle status for visible binder documents and never selects summary content", async () => {
    const fixture = binderClient({
      summaryRows: [
        { document_id: documentId, status: "failed" },
        { document_id: documentId, status: "completed" },
      ],
    });
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    const result = await getDocumentBinder(parseDocumentBinderSearchParams({}));

    expect(fixture.summaryStatusChain.eq).toHaveBeenCalledWith("household_id", householdId);
    expect(fixture.summaryStatusChain.in).toHaveBeenCalledWith("document_id", [documentId]);
    expect(fixture.summaryStatusChain.select).toHaveBeenCalledWith("document_id, status");
    expect(fixture.summaryStatusChain.select.mock.calls[0][0]).not.toContain("structured_summary");
    expect(fixture.summaryStatusChain.select.mock.calls[0][0]).not.toContain("source_references");
    expect(result.documents[0]).toMatchObject({ summaryStatus: "completed" });
  });

  it("counts every active processing terminal state, including unsupported documents, while excluding archives", async () => {
    const fixture = dashboardClient([
      { data: [{ id: documentId, title: "Synthetic active document" }] },
      { count: 8 },
      { count: 1 },
      { count: 1 },
      { count: 2 },
      { count: 1 },
      { count: 1 },
      { count: 1 },
      { count: 1 },
      { count: 1 },
      { count: 3 },
      { count: 2 },
      { count: 1 },
    ]);
    mocks.createServerComponentSupabaseClient.mockResolvedValue(fixture.client);

    const summary = await getDocumentDashboardSummary();

    expect(summary).toMatchObject({
      activeCount: 8,
      awaitingProcessingCount: 2,
      completedCount: 1,
      needsOcrCount: 1,
      processingCount: 1,
      processingFailedCount: 1,
      summaryAvailableCount: 3,
      summaryFailedCount: 1,
      summaryPendingCount: 2,
      unsupportedCount: 1,
    });
    expect(fixture.from).toHaveBeenCalledTimes(13);
    const unsupportedQuery = fixture.queries[8];
    expect(unsupportedQuery?.eq).toHaveBeenCalledWith("upload_status", "uploaded");
    expect(unsupportedQuery?.eq).toHaveBeenCalledWith("processing_status", "unsupported");
    expect(unsupportedQuery?.is).toHaveBeenCalledWith("deleted_at", null);
    const availableSummariesQuery = fixture.queries[10];
    expect(availableSummariesQuery?.eq).toHaveBeenCalledWith("household_id", householdId);
    expect(availableSummariesQuery?.eq).toHaveBeenCalledWith("status", "completed");
    expect(availableSummariesQuery?.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });
});
