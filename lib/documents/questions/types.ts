import type { DocumentQuestionLanguage } from "./constants";
import type { DocumentSummarySelectedSource, DocumentSummarySourceSelection } from "../summaries/types";

export type DocumentQuestionOutput = {
  answer: string;
  sourceKeys: readonly string[];
};

export type DocumentQuestionPrompt = {
  promptVersion: string;
  instructions: string;
  input: string;
};

export type DocumentQuestionProviderRequest = {
  language: DocumentQuestionLanguage;
  prompt: DocumentQuestionPrompt;
};

export type DocumentQuestionProviderResult = {
  provider: string;
  modelIdentifier: string;
  providerCallCount: number;
  answer: DocumentQuestionOutput;
};

export interface DocumentQuestionProvider {
  answer(request: DocumentQuestionProviderRequest): Promise<DocumentQuestionProviderResult>;
}

export type DocumentQuestionResolvedSourceReference = {
  sourceKey: string;
  pageId: string;
  chunkId: string | null;
  pageNumber: number;
  chunkIndex: number | null;
  excerpt: string;
};

export type DocumentQuestionPromptBuildInput = {
  language: DocumentQuestionLanguage;
  question: string;
  selection: DocumentSummarySourceSelection;
  sources: readonly DocumentSummarySelectedSource[];
};
