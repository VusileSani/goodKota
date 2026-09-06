export class RetentionService {
  constructor(store) {
    this.store = store;
  }

  enforce(now = Date.now()) {
    const beforeLocations = this.store.state.driverLocations.length;
    this.store.state.driverLocations = this.store.state.driverLocations.filter(item => !item.expiresAt || item.expiresAt > now);

    const telemetryCutoff = now - Number(this.store.state.platform.retention?.telemetryDays || 30) * 86_400_000;
    this.store.state.telemetryEvents = this.store.state.telemetryEvents.filter(item => Number(item.createdAt || now) >= telemetryCutoff);

    if (beforeLocations !== this.store.state.driverLocations.length) this.store.save();
  }
}
