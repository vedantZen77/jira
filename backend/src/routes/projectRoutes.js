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
const { applyTemplateToProject } = require('../controllers/templateController');

router.route('/').get(protect, getProjects).post(protect, createProject);
router.put('/:id/leads', protect, updateProjectLeads);
router.post('/:projectId/templates/apply', protect, applyTemplateToProject);
router
  .route('/:id')
  .get(protect, getProjectById)
  .put(protect, updateProject)
  .delete(protect, deleteProject);

module.exports = router;
