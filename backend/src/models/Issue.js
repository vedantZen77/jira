const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a title'],
    },
    description: {
      type: String,
    },
    issueType: {
      type: String,
      enum: ['Bug', 'Feature', 'Task', 'Epic', 'Subtask'],
      default: 'Task',
    },
    status: {
      type: String,
      enum: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'],
      default: 'Todo',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Low',
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Multiple assignees for the same ticket (primary assignee is kept in `assignee` for legacy UI)
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    labels: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
    dueDate: {
      type: Date,
    },
    storyPoints: {
      type: Number,
    },
    completedAt: {
      type: Date,
    },
    checklist: [
      {
        text: { type: String, required: true, trim: true },
        completed: { type: Boolean, default: false },
        assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
      },
    ],
    // Recurring metadata copied from template (for visibility/auditing)
    recurring: {
      type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
      },
    },
    lastGeneratedAt: {
      type: Date,
    },
    lifeline: {
      assigned: [
        {
          assignee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          action: {
            type: String,
            enum: ['assigned', 'unassigned'],
            required: true,
          },
          actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          changedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      status: [
        {
          from: {
            type: String,
            enum: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done', null],
            default: null,
          },
          to: {
            type: String,
            enum: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'],
            required: true,
          },
          actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          changedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      iterations: [
        {
          author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          content: {
            type: String,
            required: true,
            trim: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

issueSchema.index({ projectId: 1, status: 1 });
issueSchema.index({ assignee: 1, status: 1 });
issueSchema.index({ assignees: 1, status: 1 });
issueSchema.index({ dependencies: 1 });
issueSchema.index({ completedAt: 1 });
issueSchema.index({ 'recurring.type': 1, lastGeneratedAt: 1 });

module.exports = mongoose.model('Issue', issueSchema);
