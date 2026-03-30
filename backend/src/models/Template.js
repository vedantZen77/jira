const mongoose = require('mongoose');

// Optimized template model: store only references to existing tickets,
// never duplicate ticket content into templates.
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
    // Ticket references (order defines preview/import order)
    tickets: [
      {
        ticketId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Issue',
          required: true,
        },
        order: {
          type: Number,
          default: 0,
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

