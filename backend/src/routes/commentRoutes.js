const express = require('express');
const router = express.Router();
const {
  getCommentsByIssue,
  createComment,
  deleteComment,
} = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, createComment);
router.route('/issue/:issueId').get(protect, getCommentsByIssue);
router.route('/:id').delete(protect, deleteComment);

module.exports = router;
