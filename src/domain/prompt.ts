export type AttachedPromptFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  textContent?: string;
  note?: string;
  textTruncated?: boolean;
};

export type PromptContextPreviewAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  excerpt: string | null;
  note: string | null;
  textTruncated: boolean;
  includedCharCount: number;
};

export type PromptContextPreview = {
  preparedPrompt: string;
  providerLabel: string;
  providerEndpoint: string;
  providerHost: string;
  providerRisk: {
    tone: "neutral" | "warning";
    summary: string;
  };
  attachments: PromptContextPreviewAttachment[];
  warnings: string[];
  estimatedChars: number;
  requiresCloudReview: boolean;
  requiresReview: boolean;
  requiresExplicitOptIn: boolean;
  secretWillBeUsed: boolean;
  reviewReason: string;
};
