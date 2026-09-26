import express from "express";

import { AccountsRepository } from "./repository/accounts.js";
import { RatesRepository } from "./repository/rates.js";
import { LogRepository } from "./repository/log.js";

import { AccountsService } from "./services/accounts.js";
import { RatesService } from "./services/rates.js";
import { LogService } from "./services/log.js";
import { ExchangeService } from "./services/exchange.js";

import { createAccountsRouter } from "./api/accounts.js";
import { createRatesRouter } from "./api/rates.js";
import { createLogRouter } from "./api/log.js";
import { createExchangeRouter } from "./api/exchange.js";

import { DomainError } from "./exceptions/errors.js";
import { connectRedis } from "./repository/redisClient.js";

await connectRedis();

// single shared instance per resource, so every service/route
// reads and writes the same in-memory state
const accountsRepository = new AccountsRepository();
const ratesRepository = new RatesRepository();
const logRepository = new LogRepository();

await accountsRepository.init();
await ratesRepository.init();
await logRepository.init();

const accountsService = new AccountsService(accountsRepository);
const ratesService = new RatesService(ratesRepository);
const logService = new LogService(logRepository);
const exchangeService = new ExchangeService(
  accountsRepository,
  ratesRepository,
  logRepository
);

const app = express();
const port = 3000;

app.use(express.json());

app.use("/accounts", createAccountsRouter(accountsService));
app.use("/rates", createRatesRouter(ratesService));
app.use("/log", createLogRouter(logService));
app.use("/exchange", createExchangeRouter(exchangeService));

app.use((err, req, res, next) => {
  if (err instanceof DomainError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Exchange API listening on port ${port}`);
});

export default app;
