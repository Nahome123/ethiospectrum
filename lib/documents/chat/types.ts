import type { DocumentSummarySelectedSource, DocumentSummarySourceSelection } from "../summaries/types";
import type { DocumentChatLanguage, DocumentChatMessageRole, DocumentChatResultType } from "./constants";

export type DocumentChatOutput = {
  answer: string;
  resultType: DocumentChatResultType;
  sourceKeys: readonly string[];
};

export type DocumentChatHistoryMessage = {
  role: DocumentChatMessageRole;
  content: string;
};

export type DocumentChatPrompt = {
  promptVersion: string;
  instructions: string;
  input: string;
};

export type DocumentChatProviderRequest = {
  language: DocumentChatLanguage;
  prompt: DocumentChatPrompt;
};

export type DocumentChatProviderResult = {
  provider: string;
  modelIdentifier: string;
  providerCallCount: number;
  answer: DocumentChatOutput;
};

export interface DocumentChatProvider {
  answer(request: DocumentChatProviderRequest): Promise<DocumentChatProviderResult>;
}

export type DocumentChatPromptBuildInput = {
  language: DocumentChatLanguage;
  history: readonly DocumentChatHistoryMessage[];
  selection: DocumentSummarySourceSelection;
  sources: readonly DocumentSummarySelectedSource[];
};

export type DocumentChatResolvedCitation = {
  sourceKey: string;
  pageId: string;
  chunkId: string | null;
  pageNumber: number;
  chunkIndex: number | null;
};
