/* eslint-disable camelcase -- the GitHub REST API uses snake_case */
import {
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import {createMarkerMatcher, legacyMarker, renderComment} from './comment.js';
import {findPreviousComment, publishComment} from './pr-comment.js';

const target = {owner: 'o', repo: 'r', issueNumber: 7};
const marked = tag => renderComment({content: 'old\n', headline: 'H', tag});
const bot = {login: 'github-actions[bot]', type: 'Bot'};

/**
 A fake octokit that holds the given comments.
 @param {object[]} comments - The comments of the pull request.
 @param {{authenticated?: Error | object, update?: Error}} [behaviour] - How the user lookup and the edit answer.
 @returns {object} - The fake, with spies for the calls that write.
 */
const fakeOctokit = (comments, {authenticated = new Error('forbidden'), update} = {}) => ({
	paginate: vi.fn(async () => comments),
	rest: {
		users: {
			getAuthenticated: vi.fn(async () => {
				if (authenticated instanceof Error) {
					throw authenticated;
				}

				return {data: authenticated};
			}),
		},
		issues: {
			listComments: vi.fn(),
			createComment: vi.fn(async () => ({data: {id: 100}})),
			updateComment: vi.fn(async ({comment_id: id}) => {
				if (update) {
					throw update;
				}

				return {data: {id}};
			}),
		},
	},
});

describe('findPreviousComment', () => {
	const isMarked = createMarkerMatcher('t');

	test('finds the newest marked comment of the bot', async () => {
		const octokit = fakeOctokit([
			{id: 1, body: marked('t'), user: bot},
			{id: 2, body: marked('t'), user: bot},
			{id: 3, body: marked('other'), user: bot},
		]);
		expect(await findPreviousComment(octokit, {...target, isMarked})).toMatchObject({id: 2});
	});

	test('finds a comment of an earlier version by the thollander marker', async () => {
		const octokit = fakeOctokit([{id: 5, body: `# H\nx\n${legacyMarker('t')}`, user: bot}]);
		expect(await findPreviousComment(octokit, {...target, isMarked})).toMatchObject({id: 5});
	});

	test('ignores a marked comment of a human', async () => {
		const octokit = fakeOctokit([{id: 1, body: marked('t'), user: {login: 'someone', type: 'User'}}]);
		expect(await findPreviousComment(octokit, {...target, isMarked})).toBeUndefined();
	});

	test('ignores comments without a body', async () => {
		const octokit = fakeOctokit([{id: 1, body: null, user: bot}]);
		expect(await findPreviousComment(octokit, {...target, isMarked})).toBeUndefined();
	});
});

describe('publishComment', () => {
	const isMarked = createMarkerMatcher('t');
	const render = () => 'NEW BODY';

	test('creates a comment when none exists', async () => {
		const octokit = fakeOctokit([]);
		const result = await publishComment(octokit, {
			...target, render, isMarked, mode: 'update',
		});
		expect(result).toEqual({action: 'created', id: 100});
		expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
			owner: 'o', repo: 'r', issue_number: 7, body: 'NEW BODY',
		});
	});

	test('edits the earlier comment in update mode and hands its body to render', async () => {
		const octokit = fakeOctokit([{id: 9, body: marked('t'), user: bot}]);
		const spy = vi.fn(() => 'EDITED');
		const result = await publishComment(octokit, {
			...target, render: spy, isMarked, mode: 'update',
		});
		expect(spy).toHaveBeenCalledWith(marked('t'));
		expect(result).toEqual({action: 'updated', id: 9});
		expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
			owner: 'o', repo: 'r', comment_id: 9, body: 'EDITED',
		});
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
	});

	test('always creates a comment in new mode, without even looking', async () => {
		const octokit = fakeOctokit([{id: 9, body: marked('t'), user: bot}]);
		const result = await publishComment(octokit, {
			...target, render, isMarked, mode: 'new',
		});
		expect(result.action).toBe('created');
		expect(octokit.paginate).not.toHaveBeenCalled();
	});

	test('also edits a comment of the account that owns the token', async () => {
		const octokit = fakeOctokit(
			[{id: 4, body: marked('t'), user: {login: 'me', type: 'User'}}],
			{authenticated: {login: 'me'}},
		);
		expect(await publishComment(octokit, {
			...target, render, isMarked, mode: 'update',
		})).toEqual({action: 'updated', id: 4});
	});

	test('posts a new comment when the earlier one is gone (404) and says so', async () => {
		const octokit = fakeOctokit([{id: 9, body: marked('t'), user: bot}], {update: Object.assign(new Error('Not Found'), {status: 404})});
		const log = vi.fn();
		const result = await publishComment(octokit, {
			...target, render, isMarked, mode: 'update', log,
		});
		expect(result.action).toBe('created');
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Comment 9 no longer exists'));
	});

	test('passes on any other error instead of posting a duplicate', async () => {
		const octokit = fakeOctokit([{id: 9, body: marked('t'), user: bot}], {update: Object.assign(new Error('Forbidden'), {status: 403})});
		await expect(publishComment(octokit, {
			...target, render, isMarked, mode: 'update',
		})).rejects.toThrow('Forbidden');
		expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
	});
});
