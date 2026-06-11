// @vitest-environment jsdom

import { StrictMode, act, useCallback, useState, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderConfig } from "../../domain/provider";
import type { CommandResult, ProviderSecretStatus } from "../../lib/providerCommands";
import { deleteProviderSecret, storeProviderSecret } from "../../lib/providerCommands";
import type { ProviderStatus } from "./types";
import { useLegacyProviderMigration } from "./useLegacyProviderMigration";

vi.mock("../../lib/providerCommands", () => ({
  deleteProviderSecret: vi.fn(),
  storeProviderSecret: vi.fn(),
}));

const legacyProviders = [
  {
    id: "provider-legacy",
    name: "Legacy OpenAI",
    endpoint: "https://api.openai.com/v1/responses",
    model: "gpt-4.1-mini",
    apiKey: "legacy-secret",
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useLegacyProviderMigration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not restart legacy migration when a parent render changes callback identity", async () => {
    const secretStore = deferred<CommandResult<ProviderSecretStatus>>();
    vi.mocked(storeProviderSecret).mockReturnValue(secretStore.promise);

    function Harness({ renderId }: { renderId: number }) {
      const [, setProviders] = useState<ProviderConfig[]>([]);
      const [, setProviderStatus] = useState<ProviderStatus | null>(null);
      const [, setIsMigratingProviders] = useState(false);

      useLegacyProviderMigration({
        browserPreviewMessage: "Browser preview",
        isTauriRuntime: true,
        legacyProviders,
        onLegacySecretsScrubbed: () => renderId,
        setIsMigratingProviders,
        setProviderStatus,
        setProviders,
        toneForProviderError: () => "error",
      });

      return null;
    }

    await act(async () => {
      root.render(<Harness renderId={1} />);
    });

    await act(async () => {
      root.render(<Harness renderId={2} />);
    });

    expect(storeProviderSecret).toHaveBeenCalledTimes(1);

    await act(async () => {
      secretStore.resolve({
        status: "success",
        data: {
          providerId: "provider-legacy",
          message: "Stored provider secret.",
        },
      });
      await secretStore.promise;
    });

    expect(storeProviderSecret).toHaveBeenCalledTimes(1);
  });

  it("retries migration after a StrictMode remount cancels the first run", async () => {
    const secretStore = deferred<CommandResult<ProviderSecretStatus>>();
    vi.mocked(storeProviderSecret).mockReturnValue(secretStore.promise);

    let migrated: ProviderConfig[] = [];

    function Harness() {
      const [, setProviderStatus] = useState<ProviderStatus | null>(null);
      const [, setIsMigratingProviders] = useState(false);

      useLegacyProviderMigration({
        browserPreviewMessage: "Browser preview",
        isTauriRuntime: true,
        legacyProviders,
        onLegacySecretsScrubbed: undefined,
        setIsMigratingProviders,
        setProviderStatus,
        // Stable across renders, like the real useState setter it stands in for.
        setProviders: useCallback((next: SetStateAction<ProviderConfig[]>) => {
          migrated = typeof next === "function" ? next(migrated) : next;
        }, []),
        toneForProviderError: () => "error",
      });

      return null;
    }

    // StrictMode runs the effect, cancels it (rolling the first store back),
    // then re-runs it; the second run must perform the migration.
    await act(async () => {
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
    });

    expect(storeProviderSecret).toHaveBeenCalledTimes(2);

    await act(async () => {
      secretStore.resolve({
        status: "success",
        data: {
          providerId: "provider-legacy",
          message: "Stored provider secret.",
        },
      });
      await secretStore.promise;
    });

    expect(deleteProviderSecret).toHaveBeenCalledTimes(1);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ id: "provider-legacy", hasSecret: true });
  });
});
