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
		pullRequest: {number: 3, head: {sha: 'abcdef0123456789'}},
		repo: {owner: 'o', repo: 'r'},
		async readFile(file) {
			if (file === 'page_problems.json') {
				if (overrides.problems === undefined) {
					throw Object.assign(new Error('no such file'), {code: 'ENOENT'});
				}

				return overrides.problems;
			}

			return '## Info\n```\nhello\n```\n';
		},
		log() {},
		warn,
		...overrides,
		problems: undefined,
	});
	return {octokit, warn};
};

const created = octokit => octokit.rest.issues.createComment.mock.calls[0]?.[0].body;
const updated = octokit => octokit.rest.issues.updateComment.mock.calls[0]?.[0];

describe('postComment page problems', () => {
	test('shows the problems the capture script wrote down below the logs', async () => {
		const {octokit} = await run({}, [], {problems: JSON.stringify([{text: 'pageerror: boom', count: 2}])});
		expect(created(octokit)).toContain('> [!WARNING]\n> The page reported 1 problem that the logs above do not show:\n> - ` pageerror: boom ` (2 times)\n');
	});

	test('shows no warning when the file lists no problems or does not exist', async () => {
		const {octokit: empty} = await run({}, [], {problems: '[]'});
		const {octokit: missing, warn} = await run({});
		expect(created(empty)).not.toContain('WARNING');
		expect(created(missing)).not.toContain('WARNING');
		expect(warn).not.toHaveBeenCalled();
	});

	test('warns, and still posts the logs, when the problems file is broken', async () => {
		const {octokit, warn} = await run({}, [], {problems: '{not json'});
		expect(created(octokit)).toContain('hello');
		expect(created(octokit)).not.toContain('WARNING');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('page problems are not valid JSON'));
	});

	test('warns when the problems file cannot be read for another reason than being absent', async () => {
		const {octokit, warn} = await run({}, [], {
			async readFile(file) {
				if (file === 'page_problems.json') {
					throw Object.assign(new Error('denied'), {code: 'EACCES'});
				}

				return 'logs\n';
			},
		});
		expect(created(octokit)).toContain('logs');
		expect(warn).toHaveBeenCalledWith('The page problems could not be read (denied); they are not shown.');
	});

	test('ignores a problems file that holds something other than a list', async () => {
		const {octokit} = await run({}, [], {problems: '{"text": "x"}'});
		expect(created(octokit)).not.toContain('WARNING');
	});
});

describe('postComment', () => {
	test('posts nothing outside of a pull request', async () => {
		const log = vi.fn();
		const {octokit} = await run({}, [], {pullRequest: undefined, log});
		expect(log).toHaveBeenCalledWith('Not a pull request: nothing to comment on.');
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
	});

	test('posts a new comment with marker, headline, logs and footer, using the defaults', async () => {
		const {octokit} = await run({});
		expect(created(octokit)).toBe('<!-- webapp-console-log-action:console-log -->\n# Console Logs\n## Info\n```\nhello\n```\n\n<sub>Commit abcdef0</sub>\n');
	});

	test('links the workflow run in the footer when the environment names it', async () => {
		const {octokit} = await run({GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '42'});
		expect(created(octokit)).toContain('<sub>Commit abcdef0 · [workflow run](https://github.com/o/r/actions/runs/42)</sub>');
	});

	test('falls back to GITHUB_SHA when the pull request carries no head sha', async () => {
		const {octokit} = await run({GITHUB_SHA: '1234567890abcdef'}, [], {pullRequest: {number: 3}});
		expect(created(octokit)).toContain('<sub>Commit 1234567</sub>');
	});

	test('leaves the footer out with comment-footer false', async () => {
		const {octokit} = await run({COMMENT_FOOTER: 'false'});
		expect(created(octokit)).toBe('<!-- webapp-console-log-action:console-log -->\n# Console Logs\n## Info\n```\nhello\n```\n');
	});

	test.each(['false', '0', 'no', 'off'])('posts nothing with comment %s, and never reads the logs file', async value => {
		const readFile = vi.fn();
		const log = vi.fn();
		const {octokit} = await run({COMMENT: value}, [{id: 8, body: '<!-- webapp-console-log-action:console-log -->\nold', user: bot}], {readFile, log});
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
		expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
		expect(octokit.paginate).not.toHaveBeenCalled();
		expect(readFile).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(expect.stringContaining('comment is switched off'));
	});

	test('posts with comment true or unset', async () => {
		const {octokit: explicit} = await run({COMMENT: 'true'});
		const {octokit: unset} = await run({COMMENT: ''});
		expect(created(explicit)).toBeDefined();
		expect(created(unset)).toBeDefined();
	});

	test('uses the headline and the tag of the inputs', async () => {
		const {octokit} = await run({COMMENT_HEADLINE: 'Mine', COMMENT_TAG: 'my-tag'});
		expect(created(octokit)).toMatch(/^<!-- webapp-console-log-action:my-tag -->\n# Mine\n/v);
	});

	test('still takes the headline of the deprecated headline input', async () => {
		const {octokit, warn} = await run({HEADLINE: 'Old name'});
		expect(created(octokit)).toContain('# Old name\n');
		expect(warn).toHaveBeenCalledWith('headline is deprecated, use comment-headline instead.');
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
		expect(created(octokit)).toBe('# Console Logs\n## Info\n```\nhello\n```\n\n<sub>Commit abcdef0</sub>\n');
	});

	test('posts nothing outside of a pull request', async () => {
		const log = vi.fn();
		const {octokit} = await run({}, [], {pullRequest: undefined, log});
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith('Not a pull request: nothing to comment on.');
	});
});

/**
 A fake octokit that keeps the comments in memory, so that several runs can share them.
 @returns {object} - The fake and its comment list.
 */
const statefulOctokit = () => {
	const comments = [];
	return {
		comments,
		paginate: vi.fn(async () => comments),
		rest: {
			users: {getAuthenticated: vi.fn(async () => ({data: {}}))},
			issues: {
				listComments: vi.fn(),
				createComment: vi.fn(async ({body}) => {
					comments.push({id: comments.length + 1, body, user: bot});
					return {data: {id: comments.length}};
				}),
				updateComment: vi.fn(async ({comment_id: id, body}) => {
					comments.find(comment => comment.id === id).body = body;
					return {data: {id}};
				}),
			},
		},
	};
};

describe('postComment sections', () => {
	const call = (octokit, environment, text) => postComment({
		environment,
		octokit,
		pullRequest: {number: 3, head: {sha: 'abcdef0123'}},
		repo: {owner: 'o', repo: 'r'},
		readFile: async () => text,
		log() {},
		warn() {},
	});

	test('lets several calls share one comment, each replacing only its own section', async () => {
		const octokit = statefulOctokit();
		await call(octokit, {COMMENT_SECTION: 'Home'}, 'home logs v1\n');
		await call(octokit, {COMMENT_SECTION: 'Login'}, 'login logs v1\n');
		await call(octokit, {COMMENT_SECTION: 'Home'}, 'home logs v2\n');
		expect(octokit.comments).toHaveLength(1);
		const [{body}] = octokit.comments;
		expect(body).toContain('home logs v2');
		expect(body).not.toContain('home logs v1');
		expect(body).toContain('login logs v1');
		expect(body.indexOf('home logs v2')).toBeLessThan(body.indexOf('login logs v1'));
	});

	test('keeps sections of different tags in different comments', async () => {
		const octokit = statefulOctokit();
		await call(octokit, {COMMENT_SECTION: 'Home', COMMENT_TAG: 'a'}, 'a logs\n');
		await call(octokit, {COMMENT_SECTION: 'Home', COMMENT_TAG: 'b'}, 'b logs\n');
		expect(octokit.comments).toHaveLength(2);
	});

	test('ignores the section with comment-mode new, posts a whole comment and warns', async () => {
		const octokit = statefulOctokit();
		const warn = vi.fn();
		await postComment({
			environment: {COMMENT_SECTION: 'Home', COMMENT_MODE: 'new'},
			octokit,
			pullRequest: {number: 3},
			repo: {owner: 'o', repo: 'r'},
			readFile: async () => 'logs\n',
			log() {},
			warn,
		});
		expect(octokit.comments[0].body).not.toContain(':section:');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignored with comment-mode new'));
	});

	test('turns a section into a section of the comment a whole-comment run posted earlier', async () => {
		const octokit = statefulOctokit();
		await call(octokit, {}, 'whole logs\n');
		await call(octokit, {COMMENT_SECTION: 'Home'}, 'home logs\n');
		expect(octokit.comments).toHaveLength(1);
		expect(octokit.comments[0].body).toContain('home logs');
		expect(octokit.comments[0].body).not.toContain('whole logs');
	});
});
