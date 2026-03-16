const Comment = require('../models/Comment');
const Issue = require('../models/Issue');

// @desc    Get comments for an issue
// @route   GET /api/comments/issue/:issueId
// @access  Private
const getCommentsByIssue = async (req, res) => {
  try {
    const comments = await Comment.find({ ticketId: req.params.issueId })
      .populate('author', 'name email avatar')
      .sort({ createdAt: 1 });

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a comment
// @route   POST /api/comments
// @access  Private
const createComment = async (req, res) => {
  try {
    const { ticketId, content } = req.body;

    const issue = await Issue.findById(ticketId);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const comment = new Comment({
      ticketId,
      content,
      author: req.user._id,
    });

    const createdComment = await comment.save();
    
    // Return populated comment
    const populatedComment = await Comment.findById(createdComment._id)
      .populate('author', 'name email avatar');
      
    res.status(201).json(populatedComment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'User not authorized to delete this comment' });
    }

    await comment.deleteOne();
    res.json({ message: 'Comment removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCommentsByIssue,
  createComment,
  deleteComment,
};
