const mongoose = require('mongoose');

const recurringScheduleSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recurring: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    // When last generated for this recurring template+project schedule
    lastGeneratedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// One recurring schedule per template+project
recurringScheduleSchema.index({ templateId: 1, projectId: 1 }, { unique: true });

module.exports = mongoose.model('RecurringSchedule', recurringScheduleSchema);

