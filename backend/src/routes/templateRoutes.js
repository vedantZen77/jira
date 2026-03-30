const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTemplates,
  createTemplate,
  deleteTemplate,
  addTicketToTemplate,
  getTemplateTickets,
  updateTemplate,
} = require('../controllers/templateController');

router.get('/', protect, getTemplates);
router.post('/', protect, createTemplate);
router.delete('/:id', protect, deleteTemplate);
router.put('/:id', protect, updateTemplate);

// Template ticket management
router.get('/:id/tickets', protect, getTemplateTickets);
router.post('/:id/tickets', protect, addTicketToTemplate);

module.exports = router;

