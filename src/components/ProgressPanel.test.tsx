// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProgressPanel } from "./ProgressPanel";

describe("ProgressPanel warning display", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders one warning row per unique warning", () => {
    act(() => {
      root.render(
        <ProgressPanel
          progress={{
            jobId: "document-1",
            phase: "parsing_pdf",
            current: 2,
            total: 4,
            message: "Extracting text...",
            warnings: [
              "CID/Type0 fonts may reduce text extraction quality.",
              "Low-confidence extraction on page 3.",
              "CID/Type0 fonts may reduce text extraction quality.",
            ],
          }}
          message="Extracting text..."
          isRunning
          failure={null}
          onCancel={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain("Extraction warnings");
    expect(container.querySelectorAll(".progress-warning-item")).toHaveLength(2);
    expect(container.textContent).toContain("CID/Type0 fonts may reduce text extraction quality.");
    expect(container.textContent).toContain("Low-confidence extraction on page 3.");
  });
});
