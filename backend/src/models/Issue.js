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
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    labels: [
      {
        type: String,
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
  },
  {
    timestamps: true,
  }
);

issueSchema.index({ projectId: 1, status: 1 });
issueSchema.index({ assignee: 1, status: 1 });
issueSchema.index({ completedAt: 1 });

module.exports = mongoose.model('Issue', issueSchema);
