import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG = "../state/log.json";

export class LogRepository {
  constructor() {
    this.log = null;
  }

  async init() {
    this.log = await load(LOG);
    scheduleSave(this.log, LOG, 1000);
  }

  getLog() {
    return this.log;
  }

  addLog(entry) {
    this.log.push(entry);
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
