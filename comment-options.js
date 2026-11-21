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

const MAX_SECTION_NAME_LENGTH = 80;
const MAX_SECTION_SLUG_LENGTH = 60;

// The title of a section: one line without control characters, so it is safe
// as the title of a <details>.
function sanitizeSectionName(input) {
	return String(input ?? '')
		.replaceAll(/\p{Control}/gv, ' ')
		.replaceAll(/\s+/gv, ' ')
		.trim();
}

// The part of a section marker that identifies it: lower case letters and digits
// (of any language) with single dashes in between. Names that differ only in
// case, spacing or punctuation are the same section.
function slugifySectionName(name) {
	return name
		.toLowerCase()
		.replaceAll(/[^\p{Letter}\p{Number}]+/gv, '-')
		// Runs of other characters are one dash, so there is at most one at each end
		.replace(/^-/v, '')
		.replace(/-$/v, '')
		.slice(0, MAX_SECTION_SLUG_LENGTH)
		.replace(/-$/v, '');
}

// The comment-section input: null (the call owns the whole comment) or {name, slug}
function resolveSection(input, {mode, tag}, warnings) {
	const raw = String(input ?? '').trim();
	if (raw === '') {
		return null;
	}

	if (mode === 'new' || tag === '') {
		const why = mode === 'new' ? 'with comment-mode new' : 'with an empty comment-tag';
		warnings.push(`comment-section "${raw}" is ignored ${why}: a section is merged into the comment this action posted earlier (comment-mode update). Posting a whole new comment.`);
		return null;
	}

	let name = sanitizeSectionName(raw);
	if (name.length > MAX_SECTION_NAME_LENGTH) {
		name = name.slice(0, MAX_SECTION_NAME_LENGTH).trim();
		warnings.push(`The comment-section "${raw}" is longer than ${MAX_SECTION_NAME_LENGTH} characters and was cut to "${name}".`);
	}

	const slug = slugifySectionName(name);
	if (slug === '') {
		// Ignoring it would make this call own the whole comment and wipe the other sections
		throw new Error(`The comment-section "${raw}" has no letters or digits to identify the section by; give it a name with at least one, or leave comment-section empty for a comment of its own.`);
	}

	return {name, slug};
}

/**
 Resolve the comment inputs.
 @param {(name: string) => string | undefined} getInput Reads one raw input value; undefined for an input that is not set at all.
 @returns {{options: {comment: boolean, footer: boolean, mode: 'update' | 'new', tag: string, markerTag: string, headline: string, section: {name: string, slug: string} | null}, warnings: string[]}} The options and what to warn about.
 @throws {Error} For a comment-section that has no letter or digit to identify it by.
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
	options.section = resolveSection(getInput('comment-section'), options, warnings);
	return {options, warnings};
}

export {
	DEFAULT_COMMENT_OPTIONS,
	MODES,
	resolveCommentOptions,
	sanitizeTag,
	slugifySectionName,
};
