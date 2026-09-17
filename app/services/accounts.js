export class AccountsService {
  constructor(repository) {
    this.repository = repository;
  }

  // returns all internal accounts
  getAccounts() {
    return this.repository.getAccounts();
  }

  // sets balance for an account
  setAccountBalance(accountId, balance) {
    this.repository.setAccountBalance(accountId, balance);
  }
}
