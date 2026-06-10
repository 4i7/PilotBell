import { describe, expect, it } from "vitest";

import { normalizePromptInputPreferences } from "./inputPreferences";

describe("normalizePromptInputPreferences", () => {
  it("keeps cloud and advanced endpoint review mandatory for legacy stored preferences", () => {
    const preferences = normalizePromptInputPreferences({
      reviewCloudBeforeSend: false,
      reviewAdvancedEndpointsBeforeSend: false,
    });

    expect(preferences.reviewCloudBeforeSend).toBe(true);
    expect(preferences.reviewAdvancedEndpointsBeforeSend).toBe(true);
  });
});
