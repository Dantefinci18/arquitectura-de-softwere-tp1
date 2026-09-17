import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RATES = "../state/rates.json";

export class RatesRepository {
  constructor() {
    this.rates = null;
  }

  async init() {
    this.rates = await load(RATES);

    scheduleSave(this.rates, RATES, 5000);
  }

  getRates() {
    return this.rates;
  }

  getRate(baseCurrency, counterCurrency) {
    return this.rates[baseCurrency]?.[counterCurrency];
  }

  setRate(baseCurrency, counterCurrency, rate) {
    this.rates[baseCurrency][counterCurrency] = rate;
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
