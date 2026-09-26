import { loadOrSeed, scheduleSnapshot } from "./redisClient.js";

export class LogRepository {
  constructor() {
    this.log = null;
  }

  async init() {
    this.log = await loadOrSeed("log", "log.json");
    scheduleSnapshot("log", () => this.log, 1000);
  }

  getLog() {
    return this.log;
  }

  addLog(entry) {
    this.log.push(entry);
  }
}
