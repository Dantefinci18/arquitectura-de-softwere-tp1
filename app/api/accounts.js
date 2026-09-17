import { Router } from "express";

import { MalformedRequestError } from "../exceptions/errors.js";

export function createAccountsRouter(accountsService) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(accountsService.getAccounts());
  });

  router.put("/:id/balance", (req, res, next) => {
    const accountId = req.params.id;
    const { balance } = req.body;

    if (!accountId || !balance) {
      return next(new MalformedRequestError());
    }

    accountsService.setAccountBalance(accountId, balance);

    res.json(accountsService.getAccounts());
  });

  return router;
}
