import { describe, expect, it } from "vitest";
import { DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import { buildDocumentStoragePath, normalizeDocumentFilename } from "@/lib/documents/path";
import {
  createDocumentMetadataSchema,
  documentIdSchema,
  validateDocumentFile,
} from "@/lib/validation/document";

const messages = {
  title: "title",
  text: "text",
  category: "category",
  dependent: "dependent",
  filename: "filename",
  unsupportedFile: "unsupported",
  fileTooLarge: "too large",
  emptyFile: "empty",
};

const validDocument = {
  title: "  School enrollment form  ",
  dependentId: "",
  documentType: "education",
  originalFilename: "school-form.pdf",
  mimeType: "application/pdf",
  fileSize: "1024",
};

describe("document validation", () => {
  it("accepts allowed metadata and normalizes optional fields", () => {
    const result = createDocumentMetadataSchema(messages).parse(validDocument);

    expect(result).toEqual({
      title: "School enrollment form",
      dependentId: null,
      documentType: "education",
      originalFilename: "school-form.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
    });
  });

  it("rejects invalid document metadata before an upload can be prepared", () => {
    const schema = createDocumentMetadataSchema(messages);

    expect(schema.safeParse({ ...validDocument, title: " " }).success).toBe(false);
    expect(schema.safeParse({ ...validDocument, dependentId: "not-a-uuid" }).success).toBe(false);
    expect(schema.safeParse({ ...validDocument, documentType: "financial" }).success).toBe(false);
    expect(schema.safeParse({ ...validDocument, mimeType: "image/png" }).success).toBe(false);
    expect(schema.safeParse({ ...validDocument, fileSize: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...validDocument, fileSize: String(DOCUMENT_MAX_BYTES + 1) }).success).toBe(
      false,
    );
  });

  it("allows only the required file types, nonempty files, and the 20 MB limit", () => {
    const validationMessages = {
      unsupportedFile: messages.unsupportedFile,
      fileTooLarge: messages.fileTooLarge,
      emptyFile: messages.emptyFile,
    };

    for (const file of [
      { name: "report.pdf", size: 1, type: "application/pdf" },
      {
        name: "report.docx",
        size: DOCUMENT_MAX_BYTES,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      { name: "notes.txt", size: 100, type: "text/plain" },
    ]) {
      expect(validateDocumentFile(file, validationMessages).success).toBe(true);
    }

    expect(
      validateDocumentFile({ name: "report.pdf", size: 0, type: "application/pdf" }, validationMessages),
    ).toEqual({
      success: false,
      message: messages.emptyFile,
    });
    expect(
      validateDocumentFile(
        { name: "report.pdf", size: DOCUMENT_MAX_BYTES + 1, type: "application/pdf" },
        validationMessages,
      ),
    ).toEqual({ success: false, message: messages.fileTooLarge });
    expect(
      validateDocumentFile({ name: "report.exe", size: 100, type: "application/pdf" }, validationMessages),
    ).toEqual({
      success: false,
      message: messages.unsupportedFile,
    });
    expect(
      validateDocumentFile({ name: "report.pdf", size: 100, type: "image/png" }, validationMessages),
    ).toEqual({
      success: false,
      message: messages.unsupportedFile,
    });
  });

  it("normalizes filenames and derives a non-client-controlled household path", () => {
    const filename = normalizeDocumentFilename("..\\Household / School Report.PDF");

    expect(filename).toBe("household-school-report.pdf");
    expect(filename).not.toContain("/");
    expect(filename).not.toContain("\\");
    expect(normalizeDocumentFilename("not-a-document.exe")).toBeNull();

    expect(
      buildDocumentStoragePath({
        householdId: "10000000-0000-0000-0000-000000000001",
        dependentId: "20000000-0000-0000-0000-000000000002",
        documentId: "30000000-0000-0000-0000-000000000003",
        safeFilename: filename!,
      }),
    ).toBe(
      "households/10000000-0000-0000-0000-000000000001/dependents/20000000-0000-0000-0000-000000000002/documents/30000000-0000-0000-0000-000000000003/household-school-report.pdf",
    );
  });

  it("uses UUID document identifiers", () => {
    expect(documentIdSchema.safeParse("30000000-0000-4000-8000-000000000003").success).toBe(true);
    expect(documentIdSchema.safeParse("not-a-document-id").success).toBe(false);
  });
});
