export type AttachedPromptFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  textContent?: string;
  note?: string;
  textTruncated?: boolean;
};

export type PromptContextPreviewItem = {
  id: string;
  name: string;
  detail: string;
  excerpt: string | null;
  note: string | null;
  textTruncated: boolean;
  includedCharCount: number;
};

export type PromptContextPreview = {
  title: string;
  helperText: string;
  contextTitle: string;
  emptyContextMessage: string;
  approveLabel: string;
  preparedPrompt: string;
  providerLabel: string;
  providerEndpoint: string;
  providerHost: string;
  providerRisk: {
    tone: "neutral" | "warning";
    summary: string;
  };
  contextItems: PromptContextPreviewItem[];
  warnings: string[];
  estimatedChars: number;
  requiresCloudReview: boolean;
  requiresReview: boolean;
  requiresExplicitOptIn: boolean;
  secretWillBeUsed: boolean;
  storedSecretAvailable: boolean;
  reviewReason: string;
};
