const express = require("express");
const { requireRole } = require("../../middleware/auth");
const { AppError } = require("../../common/errors");

// /api/sync – ręczne uruchomienie synchronizacji i podgląd ostatniego wyniku (tylko ADMIN)
function createSyncRouter({ syncService, enabled }) {
  const router = express.Router();
  router.use(requireRole("ADMIN"));

  router.get("/status", (req, res) => {
    res.json({ enabled, ...syncService.status() });
  });

  router.post("/", async (req, res) => {
    if (!enabled) {
      throw new AppError(409, "SYNC_DISABLED", "Synchronizacja wyłączona – ustaw FOOTBALL_DATA_TOKEN w pliku .env");
    }
    res.json(await syncService.syncAll());
  });

  return router;
}

module.exports = { createSyncRouter };
