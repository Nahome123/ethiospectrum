export type OcrProviderResult = {
  provider: "openai";
  modelIdentifier: string;
  text: string;
};

export type OcrProviderRequest = {
  imageBytes: Uint8Array;
  pageNumber: number;
};

/** Server-only dependency boundary; tests inject this interface rather than calling a provider. */
export interface DocumentOcrProvider {
  transcribePage(request: OcrProviderRequest): Promise<OcrProviderResult>;
}

export type RenderedOcrPage = {
  pageNumber: number;
  imageBytes: Uint8Array;
  width: number;
  height: number;
};
