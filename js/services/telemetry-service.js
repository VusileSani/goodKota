import { uid } from "../core/utils.js";

export class TelemetryService {
  constructor(store) {
    this.store = store;
  }

  emit({ domain = "platform", event, level = "info", actorId = "system", merchantId = null, durationMs = null, metadata = {} }) {
    const record = {
      id: uid("telemetry"), domain, event, level, actorId, merchantId,
      durationMs: durationMs === null ? null : Number(durationMs), metadata,
      createdAt: Date.now()
    };
    this.store.appendTelemetry(record);
    if (level === "error") console.error("[GoodKota]", event, metadata);
    else console.info("[GoodKota]", event, metadata);
    return record;
  }

  alert({ type, severity = "warning", message, domain = "platform", metadata = {} }) {
    return this.store.appendOperationalAlert({
      id: uid("alert"), type, severity, message, domain, metadata, status: "open", createdAt: Date.now()
    });
  }
}
