const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectLeads,
  deleteProject,
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getProjects).post(protect, createProject);
router.put('/:id/leads', protect, updateProjectLeads);
router
  .route('/:id')
  .get(protect, getProjectById)
  .put(protect, updateProject)
  .delete(protect, deleteProject);

module.exports = router;
