import { useState } from "react";

import {
  type ProviderHealthRecord,
  loadProviderHealthRecords,
  saveProviderHealthRecords,
} from "../../lib/providerHealthStore";

export function useProviderHealthRecords() {
  const [providerHealthRecords, setProviderHealthRecords] = useState<
    Record<string, ProviderHealthRecord>
  >(() => loadProviderHealthRecords());

  function updateProviderHealthRecord(record: ProviderHealthRecord) {
    setProviderHealthRecords((current) => {
      const next = {
        ...current,
        [record.providerId]: record,
      };
      saveProviderHealthRecords(next);
      return next;
    });
  }

  function removeProviderHealthRecord(providerId: string) {
    setProviderHealthRecords((current) => {
      const next = { ...current };
      delete next[providerId];
      saveProviderHealthRecords(next);
      return next;
    });
  }

  return {
    providerHealthRecords,
    updateProviderHealthRecord,
    removeProviderHealthRecord,
  };
}
