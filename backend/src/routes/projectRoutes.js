const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectLeads,
  deleteProject,
  exportProjectBackup,
  importProjectBackup,
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { applyTemplateToProject } = require('../controllers/templateController');

router.route('/').get(protect, getProjects).post(protect, createProject);
router.post('/import', protect, importProjectBackup);
router.put('/:id/leads', protect, updateProjectLeads);
router.get('/:id/export', protect, exportProjectBackup);
router.post('/:projectId/templates/apply', protect, applyTemplateToProject);
router
  .route('/:id')
  .get(protect, getProjectById)
  .put(protect, updateProject)
  .delete(protect, deleteProject);

module.exports = router;
