import { loadOrSeed, scheduleSnapshot } from "./redisClient.js";

export class AccountsRepository {
  constructor() {
    this.accounts = null;
    this.locks = new Map();
  }

  async init() {
    this.accounts = await loadOrSeed("accounts", "accounts.json");
    scheduleSnapshot("accounts", () => this.accounts, 1000);
  }

  getAccounts() {
    return this.accounts;
  }

  getAccountById(id) {
    return this.accounts.find((account) => account.id == id) ?? null;
  }

  getAccountByCurrency(currency) {
    return this.accounts.find((account) => account.currency == currency) ?? null;
  }

  setAccountBalance(accountId, balance) {
    const account = this.getAccountById(accountId);
    if (account != null) {
      account.balance = balance;
    }
  }

  adjustAccountBalance(accountId, delta) {
    const account = this.getAccountById(accountId);
    if (account != null) {
      account.balance += delta;
    }
  }

  async withAccountsLock(accountIds, fn) {
    const ids = [...new Set(accountIds)].sort();
    const releases = [];
    try {
      for (const id of ids) {
        releases.push(await this.acquireLock(id));
      }
      return await fn();
    } finally {
      for (const release of releases.reverse()) {
        release();
      }
    }
  }

  acquireLock(accountId) {
    const tail = this.locks.get(accountId) ?? Promise.resolve();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    this.locks.set(accountId, tail.then(() => held));
    return tail.then(() => release);
  }
}
