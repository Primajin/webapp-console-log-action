/* eslint-disable camelcase -- the GitHub REST API uses snake_case */
import {
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import {legacyMarker} from './comment.js';
import {postComment} from './post-comment.js';

const bot = {login: 'github-actions[bot]', type: 'Bot'};

/**
 Runs postComment against a fake octokit holding the given comments.
 @param {{[key: string]: string}} environment - The input environment variables.
 @param {object[]} [comments] - The comments already on the pull request.
 @param {object} [overrides] - Further dependencies to override.
 @returns {Promise<{octokit: object, warn: ReturnType<typeof vi.fn>}>} - The fake and the warning spy.
 */
const run = async (environment, comments = [], overrides = {}) => {
	const octokit = {
		paginate: vi.fn(async () => comments),
		rest: {
			users: {getAuthenticated: vi.fn(async () => ({data: {}}))},
			issues: {
				listComments: vi.fn(),
				createComment: vi.fn(async () => ({data: {id: 100}})),
				updateComment: vi.fn(async ({comment_id: id}) => ({data: {id}})),
			},
		},
	};
	const warn = vi.fn();
	await postComment({
		environment,
		octokit,
		pullRequest: {number: 3},
		repo: {owner: 'o', repo: 'r'},
		readFile: async () => '## Info\n```\nhello\n```\n',
		log() {},
		warn,
		...overrides,
	});
	return {octokit, warn};
};

const created = octokit => octokit.rest.issues.createComment.mock.calls[0]?.[0].body;
const updated = octokit => octokit.rest.issues.updateComment.mock.calls[0]?.[0];

describe('postComment', () => {
	test('posts a new comment with marker, headline and logs, using the defaults', async () => {
		const {octokit} = await run({});
		expect(created(octokit)).toBe('<!-- webapp-console-log-action:console-log -->\n# Console Logs\n## Info\n```\nhello\n```\n');
	});

	test('uses the headline and the tag of the inputs', async () => {
		const {octokit} = await run({HEADLINE: 'Mine', COMMENT_TAG: 'my-tag'});
		expect(created(octokit)).toMatch(/^<!-- webapp-console-log-action:my-tag -->\n# Mine\n/v);
	});

	test('edits the comment of an earlier run in place', async () => {
		const earlier = '<!-- webapp-console-log-action:console-log -->\n# Console Logs\nold\n';
		const {octokit} = await run({}, [{id: 8, body: earlier, user: bot}]);
		expect(updated(octokit)).toMatchObject({comment_id: 8});
		expect(updated(octokit).body).toContain('hello');
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
	});

	test('edits a comment that an earlier version posted with thollander, and replaces its marker', async () => {
		const earlier = `# Console Logs\nold\n\n${legacyMarker('console-log')}`;
		const {octokit} = await run({}, [{id: 8, body: earlier, user: bot}]);
		expect(updated(octokit)).toMatchObject({comment_id: 8});
		expect(updated(octokit).body).not.toContain('Sticky Pull Request Comment');
		expect(updated(octokit).body).toMatch(/^<!-- webapp-console-log-action:console-log -->/v);
	});

	test('finds the thollander comment of a tag with characters the new marker cannot hold', async () => {
		const earlier = `# Console Logs\nold\n\n${legacyMarker('a/b')}`;
		const {octokit, warn} = await run({COMMENT_TAG: 'a/b'}, [{id: 8, body: earlier, user: bot}]);
		expect(updated(octokit)).toMatchObject({comment_id: 8});
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('comment-tag "a/b"'));
	});

	test('always posts a new comment with comment-mode new, even with the tag of an earlier one', async () => {
		const earlier = '<!-- webapp-console-log-action:console-log -->\n# Console Logs\nold\n';
		const {octokit} = await run({COMMENT_MODE: 'new'}, [{id: 8, body: earlier, user: bot}]);
		expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
		expect(created(octokit)).toContain('hello');
	});

	test('always posts a new comment, without a marker, for an empty comment-tag', async () => {
		const earlier = '<!-- webapp-console-log-action:console-log -->\n# Console Logs\nold\n';
		const {octokit} = await run({COMMENT_TAG: ''}, [{id: 8, body: earlier, user: bot}]);
		expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
		expect(created(octokit)).toBe('# Console Logs\n## Info\n```\nhello\n```\n');
	});

	test('posts nothing outside of a pull request', async () => {
		const log = vi.fn();
		const {octokit} = await run({}, [], {pullRequest: undefined, log});
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith('Not a pull request: nothing to comment on.');
	});
});
