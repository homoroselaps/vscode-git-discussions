"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionStatus = void 0;
exports.createDiscussion = createDiscussion;
exports.addCommentToDiscussion = addCommentToDiscussion;
exports.updateDiscussionStatus = updateDiscussionStatus;
exports.removeCommentFromDiscussion = removeCommentFromDiscussion;
/**
 * Discussion status enum
 */
var DiscussionStatus;
(function (DiscussionStatus) {
    DiscussionStatus["Active"] = "active";
    DiscussionStatus["Resolved"] = "resolved";
    DiscussionStatus["Archived"] = "archived";
})(DiscussionStatus || (exports.DiscussionStatus = DiscussionStatus = {}));
/**
 * Factory function to create a new Discussion
 */
function createDiscussion(id, filePath, range, initialComment, author) {
    const now = new Date().toISOString();
    return {
        id,
        filePath,
        range,
        status: DiscussionStatus.Active,
        createdAt: now,
        updatedAt: now,
        author,
        comments: [initialComment],
    };
}
/**
 * Add a comment to a discussion
 */
function addCommentToDiscussion(discussion, comment) {
    return {
        ...discussion,
        comments: [...discussion.comments, comment],
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Update discussion status
 */
function updateDiscussionStatus(discussion, status) {
    return {
        ...discussion,
        status,
        updatedAt: new Date().toISOString(),
    };
}
/**
 * Remove a comment from a discussion
 */
function removeCommentFromDiscussion(discussion, commentId) {
    return {
        ...discussion,
        comments: discussion.comments.filter((c) => c.id !== commentId),
        updatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=discussion.model.js.map