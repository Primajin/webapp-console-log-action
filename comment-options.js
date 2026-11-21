// Resolves the comment inputs (pure, unit tested). Enum inputs that hold an
// unknown value log a warning and fall back to the default; empty means default.
// Same rules as Primajin/screenshots-ci-action's comment-options.js.

const MODES = ['update', 'new'];

const DEFAULT_COMMENT_OPTIONS = {
	comment: true,
	footer: true,
	mode: 'update',
	tag: 'console-log',
	headline: 'Console Logs',
};

const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

// Switches that are on by default: only the false values turn them off. Other
// values keep the switch on, but a typo like "fasle" gets a warning.
function resolveSwitch(name, input, fallback, warnings) {
	const raw = String(input ?? '').trim().toLowerCase();
	if (raw === '') {
		return fallback;
	}

	if (FALSE_VALUES.has(raw)) {
		return false;
	}

	if (!TRUE_VALUES.has(raw)) {
		warnings.push(`Unknown ${name} "${String(input).trim()}"; use true or false. Using "${fallback}".`);
		return fallback;
	}

	return true;
}

function resolveEnum({name, allowed, fallback}, input, warnings) {
	const raw = String(input ?? '').trim().toLowerCase();
	if (raw === '') {
		return fallback;
	}

	if (allowed.includes(raw)) {
		return raw;
	}

	warnings.push(
		`Unknown ${name} "${String(input).trim()}"; use ${allowed.join(', ')}. Using "${fallback}".`,
	);
	return fallback;
}

// The tag ends up inside an HTML comment, so keep it to harmless characters:
// letters and digits of any language, underscore, dot, dash and space.
function sanitizeTag(input) {
	return String(input ?? '').trim().replaceAll(/[^\p{Letter}\p{Number} \-._]/gv, '-');
}

// An unset comment-tag is the default; an empty one is meant: every run posts a
// new comment (the behaviour of this action since before comment-mode existed).
// `tag` is what the workflow wrote, `markerTag` what is safe inside the marker.
function resolveTag(input, fallback, warnings) {
	if (input === undefined) {
		return {tag: fallback, markerTag: fallback};
	}

	const tag = String(input).trim();
	const markerTag = sanitizeTag(tag);
	if (markerTag !== tag) {
		warnings.push(
			`The comment-tag "${tag}" contains characters other than letters, digits, space, dot, dash and underscore; `
			+ `they were replaced with "-" in the marker of the comment: "${markerTag}".`,
		);
	}

	return {tag, markerTag};
}

// Comment-headline is canonical, headline its deprecated alias; neither has a default in action.yml,
// or an unset comment-headline could not be told from a set one.
function resolveHeadline(canonical, alias, fallback, warnings) {
	const preferred = String(canonical ?? '').trim();
	const deprecated = String(alias ?? '').trim();
	if (preferred !== '') {
		if (deprecated !== '' && deprecated !== preferred) {
			warnings.push(`Both comment-headline and headline are set; using comment-headline "${preferred}". headline is deprecated, remove it.`);
		}

		return preferred;
	}

	if (deprecated !== '') {
		warnings.push('headline is deprecated, use comment-headline instead.');
		return deprecated;
	}

	return fallback;
}

/**
 Resolve the comment inputs.
 @param {(name: string) => string | undefined} getInput Reads one raw input value; undefined for an input that is not set at all.
 @returns {{options: {comment: boolean, footer: boolean, mode: 'update' | 'new', tag: string, markerTag: string, headline: string}, warnings: string[]}} The options and what to warn about.
 */
function resolveCommentOptions(getInput) {
	const defaults = DEFAULT_COMMENT_OPTIONS;
	const warnings = [];
	const {tag, markerTag} = resolveTag(getInput('comment-tag'), defaults.tag, warnings);
	const options = {
		comment: resolveSwitch('comment', getInput('comment'), defaults.comment, warnings),
		footer: resolveSwitch('comment-footer', getInput('comment-footer'), defaults.footer, warnings),
		mode: resolveEnum({name: 'comment-mode', allowed: MODES, fallback: defaults.mode}, getInput('comment-mode'), warnings),
		tag,
		markerTag,
		headline: resolveHeadline(getInput('comment-headline'), getInput('headline'), defaults.headline, warnings),
	};
	return {options, warnings};
}

export {
	DEFAULT_COMMENT_OPTIONS,
	MODES,
	resolveCommentOptions,
	sanitizeTag,
};
