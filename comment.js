// Renders the PR comment body (pure, unit tested).

// Hidden first line that lets the next run find (and edit) its earlier comment.
function commentMarker(tag) {
	return `<!-- webapp-console-log-action:${tag} -->`;
}

// The marker thollander/actions-comment-pull-request wrote at the END of the
// comments of earlier versions of this action. It is still recognised, so a
// comment posted before the switch is updated in place instead of duplicated.
function legacyMarker(tag) {
	return `<!-- Sticky Pull Request Comment${tag} -->`;
}

// The comment starts with the marker line (a bare marker is fine too).
function startsWithMarker(body, marker) {
	return body === marker || body.startsWith(`${marker}\n`) || body.startsWith(`${marker}\r\n`);
}

/**
 Build the function that tells whether a comment body belongs to a tag.
 @param {string} tag The comment-tag as the workflow wrote it (the legacy marker is built from it as it is).
 @param {string} [safeTag] The tag as it is written into the marker line; defaults to the tag.
 @returns {(body: string) => boolean} True for a body that starts with the marker of this action or carries the legacy marker of the tag.
 */
function createMarkerMatcher(tag, safeTag = tag) {
	return body => startsWithMarker(body, commentMarker(safeTag)) || body.includes(legacyMarker(tag));
}

/**
 Render the comment: the marker line, the headline and what the format step wrote.
 @param {{content: string, headline: string, tag: string}} parts The finished markdown of the logs, the headline (plain text) and the tag.
 @returns {string} The body, starting with the marker line of the tag (none for an empty tag).
 */
function renderComment({content, headline, tag}) {
	// An empty tag means every run posts a new comment, so there is nothing to find it by
	const marker = tag === '' ? '' : `${commentMarker(tag)}\n`;
	return `${marker}# ${headline}\n${content}`;
}

export {
	commentMarker, createMarkerMatcher, legacyMarker, renderComment, startsWithMarker,
};
