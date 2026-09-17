import { nanoid } from "nanoid";

export class ExchangeService {
  constructor(accountsRepository, ratesRepository, logRepository) {
    this.accountsRepository = accountsRepository;
    this.ratesRepository = ratesRepository;
    this.logRepository = logRepository;
  }

  // executes an exchange operation
  async exchange(exchangeRequest) {
    const {
      baseCurrency,
      counterCurrency,
      baseAccountId: clientBaseAccountId,
      counterAccountId: clientCounterAccountId,
      baseAmount,
    } = exchangeRequest;

    // get the exchange rate
    const exchangeRate = this.ratesRepository.getRate(baseCurrency, counterCurrency);
    // compute the requested (counter) amount
    const counterAmount = baseAmount * exchangeRate;
    // find our account on the provided (base) currency
    const baseAccount = this.accountsRepository.getAccountByCurrency(baseCurrency);
    // find our account on the counter currency
    const counterAccount = this.accountsRepository.getAccountByCurrency(counterCurrency);

    // construct the result object with defaults
    const exchangeResult = {
      id: nanoid(),
      ts: new Date(),
      ok: false,
      request: exchangeRequest,
      exchangeRate: exchangeRate,
      counterAmount: 0.0,
      obs: null,
    };

    // check if we have funds on the counter currency account
    if (counterAccount.balance >= counterAmount) {
      // try to transfer from clients' base account
      if (await transfer(clientBaseAccountId, baseAccount.id, baseAmount)) {
        // try to transfer to clients' counter account
        if (
          await transfer(counterAccount.id, clientCounterAccountId, counterAmount)
        ) {
          // all good, update balances
          this.accountsRepository.adjustAccountBalance(baseAccount.id, baseAmount);
          this.accountsRepository.adjustAccountBalance(counterAccount.id, -counterAmount);
          exchangeResult.ok = true;
          exchangeResult.counterAmount = counterAmount;
        } else {
          // could not transfer to clients' counter account, return base amount to client
          await transfer(baseAccount.id, clientBaseAccountId, baseAmount);
          exchangeResult.obs = "Could not transfer to clients' account";
        }
      } else {
        // could not withdraw from clients' account
        exchangeResult.obs = "Could not withdraw from clients' account";
      }
    } else {
      // not enough funds on internal counter account
      exchangeResult.obs = "Not enough funds on counter currency account";
    }

    // log the transaction and return it
    this.logRepository.addLog(exchangeResult);

    return exchangeResult;
  }
}

// internal - call transfer service to execute transfer between accounts
async function transfer(fromAccountId, toAccountId, amount) {
  const min = 200;
  const max = 400;
  return new Promise((resolve) =>
    setTimeout(() => resolve(true), Math.random() * (max - min + 1) + min)
  );
}
