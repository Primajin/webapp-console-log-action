import {promises as fs} from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {context, getOctokit} from '@actions/github';
import {createMarkerMatcher, renderComment} from './comment.js';
import {resolveCommentOptions} from './comment-options.js';
import {publishComment} from './pr-comment.js';

const CONTENT_FILE = 'formatted_console_output.md';

// The inputs reach this script as environment variables named like the input (COMMENT_TAG for comment-tag)
const readInput = environment => name => environment[name.toUpperCase().replaceAll('-', '_')];

// Where the footer points: the commit under review and this workflow run
function buildFooter(pullRequest, environment) {
	const {GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId} = environment;
	return {
		sha: pullRequest.head?.sha ?? environment.GITHUB_SHA,
		runUrl: server && repository && runId
			? `${server}/${repository}/actions/runs/${runId}`
			: undefined,
	};
}

/**
 Post the console log comment to the pull request, or edit the one of an earlier run.
 @param {{environment?: object, octokit: object, pullRequest?: {number: number}, repo: {owner: string, repo: string}, readFile?: (file: string) => Promise<string>, log?: (message: string) => void, warn?: (message: string) => void}} dependencies What the run needs, injected so it can be tested.
 @returns {Promise<void>}
 */
async function postComment({
	environment = process.env,
	octokit,
	pullRequest,
	repo,
	readFile = file => fs.readFile(file, 'utf8'),
	log = console.log,
	warn = console.warn,
}) {
	if (!pullRequest) {
		log('Not a pull request: nothing to comment on.');
		return;
	}

	const {options, warnings} = resolveCommentOptions(readInput(environment));
	for (const message of warnings) {
		warn(message);
	}

	if (!options.comment) {
		log('comment is switched off: nothing is posted to the pull request.');
		return;
	}

	const content = await readFile(CONTENT_FILE);
	const footer = options.footer ? buildFooter(pullRequest, environment) : null;
	const result = await publishComment(octokit, {
		...repo,
		issueNumber: pullRequest.number,
		render: previousBody => renderComment({
			content, headline: options.headline, tag: options.markerTag, footer, section: options.section, previousBody,
		}),
		isMarked: createMarkerMatcher(options.tag, options.markerTag),
		// An empty tag has nothing to find the comment by: always a new one
		mode: options.tag === '' ? 'new' : options.mode,
		log,
	});
	log(`Comment ${result.action}: ${result.id ?? ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (!process.env.GITHUB_TOKEN) {
		throw new Error('GITHUB_TOKEN is not set: the comment cannot be posted without it.');
	}

	await postComment({
		octokit: getOctokit(process.env.GITHUB_TOKEN),
		pullRequest: context.payload.pull_request,
		repo: context.repo,
	});
}

export {postComment};
