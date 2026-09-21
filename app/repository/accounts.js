import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACCOUNTS = "../state/accounts.json";


export class AccountsRepository {
  constructor() {
    this.accounts = null;
    this.locks = new Map();
  }

  async init() {
    this.accounts = await load(ACCOUNTS);

    scheduleSave(this.accounts, ACCOUNTS, 1000);
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

async function load(fileName) {
  const filePath = path.join(__dirname, fileName);

  try {
    await fs.promises.access(filePath);
    const raw = await fs.promises.readFile(filePath, "utf8");

    return JSON.parse(raw);
  } catch (err) {
    if (err.code == "ENOENT") {
      console.error(`${filePath} not found`);
    } else {
      console.error(`Error loading ${filePath}:`, err);
    }
  }
}

async function save(data, fileName) {
  const filePath = path.join(__dirname, fileName);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing to ${filePath}:`, err);
  }
}

function scheduleSave(data, fileName, period) {
  setInterval(async () => {
    await save(data, fileName);
  }, period);
}
