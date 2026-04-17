const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  summary,
  tasksPerDay,
  statusDistribution,
  avgCompletionTime,
  workloadPerUser,
  devPerformance,
  movingTickets,
} = require('../controllers/analyticsController');

router.get('/summary', protect, summary);
router.get('/tasks-per-day', protect, tasksPerDay);
router.get('/status', protect, statusDistribution);
router.get('/avg-completion-time', protect, avgCompletionTime);
router.get('/workload-per-user', protect, workloadPerUser);
router.get('/dev-performance', protect, devPerformance);
router.get('/moving-tickets', protect, movingTickets);

module.exports = router;

