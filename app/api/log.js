import { Router } from "express";

export function createLogRouter(logService) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(logService.getLog());
  });

  return router;
}
