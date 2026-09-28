import { loadOrSeed, getRedisClient } from "./redisClient.js";

const ACCOUNTS_KEY = "accounts";

const TRANSFER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ ok = false, reason = 'accounts_not_found' })
end

local accounts = cjson.decode(raw)
local baseId = ARGV[1]
local baseAmount = tonumber(ARGV[2])
local counterId = ARGV[3]
local counterAmount = tonumber(ARGV[4])

local baseAcc, counterAcc
for _, acc in ipairs(accounts) do
  if tostring(acc.id) == baseId then baseAcc = acc end
  if tostring(acc.id) == counterId then counterAcc = acc end
end

if not baseAcc or not counterAcc then
  return cjson.encode({ ok = false, reason = 'account_not_found' })
end

if counterAcc.balance < counterAmount then
  return cjson.encode({ ok = false, reason = 'insufficient_funds' })
end

baseAcc.balance = baseAcc.balance + baseAmount
counterAcc.balance = counterAcc.balance - counterAmount

redis.call('SET', KEYS[1], cjson.encode(accounts))

return cjson.encode({ ok = true, baseBalance = baseAcc.balance, counterBalance = counterAcc.balance })
`;

const ADJUST_TWO_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ ok = false, reason = 'accounts_not_found' })
end

local accounts = cjson.decode(raw)
local id1 = ARGV[1]
local delta1 = tonumber(ARGV[2])
local id2 = ARGV[3]
local delta2 = tonumber(ARGV[4])

for _, acc in ipairs(accounts) do
  if tostring(acc.id) == id1 then acc.balance = acc.balance + delta1 end
  if tostring(acc.id) == id2 then acc.balance = acc.balance + delta2 end
end

redis.call('SET', KEYS[1], cjson.encode(accounts))

return cjson.encode({ ok = true })
`;

export class AccountsRepository {
  async init() {
    await loadOrSeed(ACCOUNTS_KEY, "accounts.json");
  }

  async getAccounts() {
    const raw = await getRedisClient().get(ACCOUNTS_KEY);
    return raw != null ? JSON.parse(raw) : [];
  }

  async getAccountById(id) {
    const accounts = await this.getAccounts();
    return accounts.find((account) => account.id == id) ?? null;
  }

  async getAccountByCurrency(currency) {
    const accounts = await this.getAccounts();
    return accounts.find((account) => account.currency == currency) ?? null;
  }

  async setAccountBalance(accountId, balance) {
    const accounts = await this.getAccounts();
    const account = accounts.find((a) => a.id == accountId);
    if (account != null) {
      account.balance = balance;
      await getRedisClient().set(ACCOUNTS_KEY, JSON.stringify(accounts));
    }
  }

  async atomicFundsTransfer(baseAccountId, baseAmount, counterAccountId, counterAmount) {
    const raw = await getRedisClient().eval(TRANSFER_SCRIPT, {
      keys: [ACCOUNTS_KEY],
      arguments: [
        String(baseAccountId),
        String(baseAmount),
        String(counterAccountId),
        String(counterAmount),
      ],
    });
    return JSON.parse(raw);
  }

  async atomicAdjustTwo(accountId1, delta1, accountId2, delta2) {
    const raw = await getRedisClient().eval(ADJUST_TWO_SCRIPT, {
      keys: [ACCOUNTS_KEY],
      arguments: [
        String(accountId1),
        String(delta1),
        String(accountId2),
        String(delta2),
      ],
    });
    return JSON.parse(raw);
  }
}
