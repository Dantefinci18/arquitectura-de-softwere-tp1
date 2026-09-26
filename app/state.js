import { createClient } from "redis";

let accounts = null;
let rates = null;
let log = null;
let client = null;

const ACCOUNTS_KEY = "accounts";
const RATES_KEY = "rates";
const LOG_KEY = "log";

const DEFAULT_ACCOUNTS = [
  { id: 1, currency: "ARS", balance: 120000000 },
  { id: 2, currency: "USD", balance: 60000 },
  { id: 3, currency: "EUR", balance: 40000 },
  { id: 4, currency: "BRL", balance: 60000 },
];

const DEFAULT_RATES = {
  ARS: { BRL: 0.0034, EUR: 0.00057, USD: 0.00066 },
  BRL: { ARS: 297.06 },
  EUR: { ARS: 1761 },
  USD: { ARS: 1513 },
};

const DEFAULT_LOG = [];

export async function init() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  client = createClient({ url });
  client.on("error", (err) => console.error("Redis client error:", err));

  await client.connect();

  accounts = await load(ACCOUNTS_KEY, DEFAULT_ACCOUNTS);
  rates = await load(RATES_KEY, DEFAULT_RATES);
  log = await load(LOG_KEY, DEFAULT_LOG);

  scheduleSave(accounts, ACCOUNTS_KEY, 1000);
  scheduleSave(rates, RATES_KEY, 5000);
  scheduleSave(log, LOG_KEY, 1000);
}

export function getAccounts() {
  return accounts;
}

export function getRates() {
  return rates;
}

export function getLog() {
  return log;
}

async function load(key, defaultValue) {
  try {
    const raw = await client.get(key);

    if (raw == null) {
      console.error(`${key} not found in Redis, seeding default value`);
      await save(defaultValue, key);
      return defaultValue;
    }

    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error loading ${key} from Redis:`, err);
    return defaultValue;
  }
}

async function save(data, key) {
  try {
    await client.set(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error writing ${key} to Redis:`, err);
  }
}

function scheduleSave(data, key, period) {
  setInterval(async () => {
    await save(data, key);
  }, period);
}
