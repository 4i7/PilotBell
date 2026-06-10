// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { loadDocumentJobs, saveDocumentJobs } from "./documentJobStore";

describe("documentJobStore persistence boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists only minimized metadata when private mode is off", () => {
    saveDocumentJobs([
      {
        jobId: "job-1",
        fileName: "Q2-report.pdf",
        filePath: "C:\\secure\\Q2-report.pdf",
        outputPath: "C:\\secure\\out",
        timestamp: "2026-06-04T00:00:00.000Z",
        status: "completed",
        selectedTemplate: "summary-report",
        providerId: "provider-1",
        warnings: ["warning"],
        errorSummary: null,
        failureKind: null,
      },
    ]);

    const persisted = localStorage.getItem("pilotbell.documentJobs");
    expect(persisted).toContain("Q2-report.pdf");
    expect(persisted).not.toContain("C:\\\\secure\\\\Q2-report.pdf");
    expect(persisted).not.toContain("provider-1");

    expect(loadDocumentJobs()[0]).toMatchObject({
      fileName: "Q2-report.pdf",
      filePath: null,
      outputPath: null,
      providerId: null,
    });
  });

  it("clears persisted metadata entirely when private mode is on", () => {
    saveDocumentJobs(
      [
        {
          jobId: "job-1",
          fileName: "Q2-report.pdf",
          timestamp: "2026-06-04T00:00:00.000Z",
          status: "completed",
          selectedTemplate: "summary-report",
        },
      ],
      { privateMode: true },
    );

    expect(localStorage.getItem("pilotbell.documentJobs")).toBeNull();
  });
});
