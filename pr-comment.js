/* eslint-disable camelcase -- the GitHub REST API uses snake_case */
// Posts the console log comment: edits the earlier comment of the same tag or
// creates a new one. Only talks to the injected octokit, so it is unit tested
// with a fake. Adapted from Primajin/screenshots-ci-action's pr-comment.js, the
// only difference is that the earlier comment is recognised by a function, so
// that the markers of earlier versions of this action are found as well.

const DEFAULT_BOT = 'github-actions[bot]';

// Logins whose comments may be edited: the default Actions bot, plus the owner
// of the token when it can be asked. A GITHUB_TOKEN and a GitHub App
// installation token cannot (GET /user answers 403, which is swallowed), so
// the comments of an App are recognised by their author type instead, see
// isOwnComment.
async function resolveAuthors(octokit) {
	const authors = [DEFAULT_BOT];
	try {
		const {data} = await octokit.rest.users.getAuthenticated();
		if (data?.login && !authors.includes(data.login)) {
			authors.push(data.login);
		}
	} catch {}

	return authors;
}

// A comment the action may have written: by a known login, or by any bot (an
// App token posts as "<app>[bot]", which cannot be looked up beforehand). Its
// body must carry the marker as well.
function isOwnComment(comment, isMarked, authors) {
	return typeof comment.body === 'string'
		&& isMarked(comment.body)
		&& (authors.includes(comment.user?.login) || comment.user?.type === 'Bot');
}

/**
 Find the action's earlier comment on a pull request.
 @param {object} octokit An authenticated octokit.
 @param {{owner: string, repo: string, issueNumber: number, isMarked: (body: string) => boolean, authors?: string[]}} options Where to look and how to recognise the comment.
 @returns {Promise<{id: number, body: string} | undefined>} The newest comment by an allowed author (or a bot) whose body is marked.
 */
async function findPreviousComment(octokit, {owner, repo, issueNumber, isMarked, authors = [DEFAULT_BOT]}) {
	const comments = await octokit.paginate(octokit.rest.issues.listComments, {
		owner,
		repo,
		issue_number: issueNumber,
		per_page: 100,
	});
	// The newest one: when an old duplicate cannot be edited, the next run
	// still finds the comment that was posted last instead of adding more.
	return comments.findLast(comment => isOwnComment(comment, isMarked, authors));
}

/**
 Create the comment, or edit the previous one in `update` mode.
 @param {object} octokit An authenticated octokit.
 @param {{owner: string, repo: string, issueNumber: number, render: (previousBody: string | undefined) => string, isMarked: (body: string) => boolean, mode: 'update' | 'new', log?: (message: string) => void}} options What to post: `render` gets the body of the comment that is edited (undefined when a new one is created) and returns the body to post, so a section can be merged into it.
 @returns {Promise<{action: 'created' | 'updated', id?: number}>} What happened.
 */
async function publishComment(octokit, {owner, repo, issueNumber, render, isMarked, mode, log = console.log}) {
	if (mode === 'update') {
		const previous = await findPreviousComment(octokit, {
			owner,
			repo,
			issueNumber,
			isMarked,
			authors: await resolveAuthors(octokit),
		});
		if (previous) {
			try {
				const {data} = await octokit.rest.issues.updateComment({
					owner,
					repo,
					comment_id: previous.id,
					body: render(previous.body),
				});
				return {action: 'updated', id: data?.id ?? previous.id};
			} catch (error) {
				// Only a comment that is gone (404) is replaced. Anything else (no
				// permission, rate limit, server error) would post a duplicate on
				// every run, so it is passed on.
				if (error.status !== 404) {
					throw error;
				}

				log(`Comment ${previous.id} no longer exists (${error.message}); posting a new comment.`);
			}
		}
	}

	const {data} = await octokit.rest.issues.createComment({
		owner,
		repo,
		issue_number: issueNumber,
		body: render(undefined),
	});
	return {action: 'created', id: data?.id};
}

export {
	findPreviousComment, isOwnComment, publishComment, resolveAuthors,
};
