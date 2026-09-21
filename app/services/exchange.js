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

    const reserved = await this.accountsRepository.withAccountsLock(
      [baseAccount.id, counterAccount.id],
      () => {
        if (counterAccount.balance < counterAmount) {
          exchangeResult.obs = "Not enough funds on counter currency account";
          return false;
        }
        this.accountsRepository.adjustAccountBalance(baseAccount.id, baseAmount);
        this.accountsRepository.adjustAccountBalance(counterAccount.id, -counterAmount);
        return true;
      }
    );

    if (reserved) {
      if (await transfer(clientBaseAccountId, baseAccount.id, baseAmount)) {
        // try to transfer to clients' counter account
        if (await transfer(counterAccount.id, clientCounterAccountId, counterAmount)) {
          // all good, the reservation already reflects the final balances
          exchangeResult.ok = true;
          exchangeResult.counterAmount = counterAmount;
        } else {
          // could not transfer to clients' counter account, return base amount to client
          await transfer(baseAccount.id, clientBaseAccountId, baseAmount);
          await this.releaseReservation(baseAccount.id, counterAccount.id, baseAmount, counterAmount);
          exchangeResult.obs = "Could not transfer to clients' account";
        }
      } else {
        // could not withdraw from clients' account, release the reservation
        await this.releaseReservation(baseAccount.id, counterAccount.id, baseAmount, counterAmount);
        exchangeResult.obs = "Could not withdraw from clients' account";
      }
    }

    // log the transaction and return it
    this.logRepository.addLog(exchangeResult);

    return exchangeResult;
  }

  // undo a reservation made in exchange() when the external transfers
  // didn't go through after all
  async releaseReservation(baseAccountId, counterAccountId, baseAmount, counterAmount) {
    await this.accountsRepository.withAccountsLock(
      [baseAccountId, counterAccountId],
      () => {
        this.accountsRepository.adjustAccountBalance(baseAccountId, -baseAmount);
        this.accountsRepository.adjustAccountBalance(counterAccountId, counterAmount);
      }
    );
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
