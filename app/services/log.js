export class LogService {
  constructor(repository) {
    this.repository = repository;
  }

  // returns the whole transaction log
  getLog() {
    return this.repository.getLog();
  }
}
