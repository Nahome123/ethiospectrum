import { z } from "zod";
import {
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
} from "@/lib/documents/constants";
import { getDocumentExtension } from "@/lib/documents/path";

type DocumentValidationMessages = {
  title: string;
  text: string;
  category: string;
  dependent: string;
  filename: string;
  unsupportedFile: string;
  fileTooLarge: string;
  emptyFile: string;
};

export function createDocumentMetadataSchema(messages: DocumentValidationMessages) {
  return z.object({
    title: z.string().trim().min(1, messages.title).max(160, messages.text),
    dependentId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, messages.dependent),
    documentType: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine(
        (value) => value === null || (DOCUMENT_CATEGORIES as readonly string[]).includes(value),
        messages.category,
      ),
    originalFilename: z.string().trim().min(1, messages.filename).max(180, messages.filename),
    mimeType: z
      .string()
      .trim()
      .refine((value) => DOCUMENT_ALLOWED_MIME_TYPES.includes(value), messages.unsupportedFile),
    fileSize: z.coerce
      .number()
      .int()
      .positive(messages.emptyFile)
      .max(DOCUMENT_MAX_BYTES, messages.fileTooLarge),
  });
}

export function createDocumentFormSchema(messages: DocumentValidationMessages) {
  return createDocumentMetadataSchema(messages).pick({ title: true, dependentId: true, documentType: true });
}

export function validateDocumentFile(
  file: Pick<File, "name" | "size" | "type">,
  messages: Pick<DocumentValidationMessages, "unsupportedFile" | "fileTooLarge" | "emptyFile">,
) {
  if (file.size <= 0) return { success: false as const, message: messages.emptyFile };
  if (file.size > DOCUMENT_MAX_BYTES) return { success: false as const, message: messages.fileTooLarge };
  if (
    !DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type) ||
    !DOCUMENT_ALLOWED_EXTENSIONS.includes(getDocumentExtension(file.name))
  ) {
    return { success: false as const, message: messages.unsupportedFile };
  }
  return { success: true as const };
}

export const documentIdSchema = z.string().uuid();
