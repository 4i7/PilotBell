import { useState } from "react";

import { testProviderConnection } from "../../lib/providerCommands";
import type { ProviderActionContext } from "./providerActionContext";

type UseProviderTestActionOptions = Pick<
  ProviderActionContext,
  | "browserPreviewMessage"
  | "isTauriRuntime"
  | "selectedProvider"
  | "setProviderStatus"
  | "toneForProviderError"
  | "updateProviderHealthRecord"
>;

export function useProviderTestAction({
  browserPreviewMessage,
  isTauriRuntime,
  selectedProvider,
  setProviderStatus,
  toneForProviderError,
  updateProviderHealthRecord,
}: UseProviderTestActionOptions) {
  const [isTestingProvider, setIsTestingProvider] = useState(false);

  async function testProvider() {
    if (!isTauriRuntime) {
      setProviderStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    if (!selectedProvider) {
      setProviderStatus({
        tone: "warning",
        message: "Select a provider before testing.",
      });
      return;
    }

    setIsTestingProvider(true);
    setProviderStatus({
      tone: "neutral",
      message: `Testing ${selectedProvider.name}...`,
    });

    try {
      const startedAt = performance.now();
      const result = await testProviderConnection(selectedProvider);
      const latencyMs = Math.round(performance.now() - startedAt);
      const checkedAt = new Date().toISOString();

      if (result.status === "success") {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: "ready",
          checkedAt,
          latencyMs,
          message: result.data.message,
        });
        setProviderStatus({
          tone: "success",
          message: `${result.data.message} (${latencyMs} ms)`,
        });
      } else {
        updateProviderHealthRecord({
          providerId: selectedProvider.id,
          readiness: result.error.retryable ? "warning" : "error",
          checkedAt,
          latencyMs,
          message: result.error.message,
          errorKind: result.error.kind,
          statusCode: result.error.statusCode ?? undefined,
          retryable: result.error.retryable,
        });
        setProviderStatus({
          tone: toneForProviderError(result.error),
          message: result.error.message,
        });
      }
    } catch (err) {
      setProviderStatus({
        tone: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTestingProvider(false);
    }
  }

  return {
    isTestingProvider,
    testProvider,
  };
}
