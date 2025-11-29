"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createComment = createComment;
exports.updateComment = updateComment;
/**
 * Factory function to create a new Comment
 */
function createComment(id, body, author) {
    const now = new Date().toISOString();
    return {
        id,
        body,
        author,
        createdAt: now,
        updatedAt: now,
    };
}
/**
 * Update a comment's body and timestamp
 */
function updateComment(comment, newBody) {
    return {
        ...comment,
        body: newBody,
        updatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=comment.model.js.map