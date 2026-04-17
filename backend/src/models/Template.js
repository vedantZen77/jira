const mongoose = require('mongoose');

// Template model stores ticket references + snapshots.
// Snapshot keeps template usable even if source tickets are deleted.
const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a template name'],
      trim: true,
    },
    description: {
      type: String,
    },
    // Ticket references + snapshot copy (order defines preview/import order)
    tickets: [
      {
        ticketId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Issue',
        },
        order: {
          type: Number,
          default: 0,
        },
        snapshot: {
          title: { type: String, trim: true },
          description: { type: String, default: '' },
          issueType: { type: String, default: 'Task' },
          priority: { type: String, default: 'Medium' },
          labels: [{ type: String }],
          checklist: [
            {
              text: { type: String, trim: true },
              completed: { type: Boolean, default: false },
            },
          ],
          storyPoints: { type: Number },
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    scope: {
      type: String,
      enum: ['global', 'project'],
      required: true,
    },
    // Required when scope === "project"
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
  },
  { timestamps: true }
);

templateSchema.index({ scope: 1, projectId: 1, createdBy: 1 });
templateSchema.index({ createdBy: 1, 'tickets.ticketId': 1 });

module.exports = mongoose.model('Template', templateSchema);

