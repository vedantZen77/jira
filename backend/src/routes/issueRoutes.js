const express = require('express');
const router = express.Router();
const {
  getIssuesByProject,
  getIssueById,
  createIssue,
  updateIssue,
  deleteIssue,
} = require('../controllers/issueController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, createIssue);
router.route('/project/:projectId').get(protect, getIssuesByProject);
router
  .route('/:id')
  .get(protect, getIssueById)
  .put(protect, updateIssue)
  .delete(protect, deleteIssue);

module.exports = router;
