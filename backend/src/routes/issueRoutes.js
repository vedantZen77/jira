const express = require('express');
const router = express.Router();
const {
  getIssuesByProject,
  getIssueById,
  createIssue,
  updateIssue,
  updateIssuePriority,
  updateIssueDueDate,
  deleteIssue,
} = require('../controllers/issueController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, createIssue);
router.route('/project/:projectId').get(protect, getIssuesByProject);
router.patch('/:id/priority', protect, updateIssuePriority);
router.patch('/:id/due-date', protect, updateIssueDueDate);
router
  .route('/:id')
  .get(protect, getIssueById)
  .put(protect, updateIssue)
  .delete(protect, deleteIssue);

module.exports = router;
