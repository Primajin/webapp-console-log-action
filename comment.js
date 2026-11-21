// Renders the PR comment body (pure, unit tested).

import {repeatNote} from './page-problems.js';

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

// The markers around a section; the slug is made of letters, digits and dashes
// only (see comment-options.js), so it is safe inside an HTML comment.
function sectionMarkers(tag, slug) {
	return {
		start: `<!-- webapp-console-log-action:${tag}:section:${slug} -->`,
		end: `<!-- /webapp-console-log-action:${tag}:section:${slug} -->`,
	};
}

const SLUG = /^[\p{Letter}\p{Number}\-]+$/v;

// The sections of an earlier comment of the tag, in the order they are in:
// [{slug, content}]. A start marker without its end marker, or with a slug that
// is not one, is not a section (the text around sections is not kept), and of
// two sections with the same slug only the first is kept.
function parseSections(body, tag) {
	const sections = [];
	const prefix = `<!-- webapp-console-log-action:${tag}:section:`;
	let from = 0;
	for (;;) {
		const start = body.indexOf(prefix, from);
		if (start === -1) {
			return sections;
		}

		const close = body.indexOf(' -->', start + prefix.length);
		if (close === -1) {
			return sections;
		}

		const slug = body.slice(start + prefix.length, close);
		const contentStart = close + ' -->'.length;
		const {end: endMarker} = sectionMarkers(tag, slug);
		const end = SLUG.test(slug) ? body.indexOf(endMarker, contentStart) : -1;
		if (end === -1) {
			from = contentStart;
			continue;
		}

		// A slug twice (a comment that was edited by hand): the first one counts
		if (sections.every(section => section.slug !== slug)) {
			sections.push({slug, content: body.slice(contentStart, end).trim()});
		}

		from = end + endMarker.length;
	}
}

const escapeHtml = value =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

/**
 Render the small footer: the commit under review and a link to the workflow run.
 @param {{sha?: string, runUrl?: string} | null | undefined} footer Where the footer points; null for no footer.
 @returns {string} The footer, or an empty string when there is nothing to show.
 */
function renderFooter(footer) {
	const parts = [
		footer?.sha ? `Commit ${footer.sha.slice(0, 7)}` : '',
		footer?.runUrl ? `[workflow run](${footer.runUrl})` : '',
	].filter(Boolean);
	return parts.length > 0 ? `<sub>${parts.join(' · ')}</sub>\n` : '';
}

// The problems the page reported, as list items: at most MAX_PROBLEM_LINES of at most
// MAX_PROBLEM_LENGTH characters of text, then how many more
export const MAX_PROBLEM_LINES = 10;
export const MAX_PROBLEM_LENGTH = 300;

// A line break in the text would end the quoted line of the warning
const oneLine = text => text.replaceAll(/\s+/gv, ' ').trim();

// At most `max` characters, cut at a whole character (not inside a surrogate pair) with an
// ellipsis as the last one
export function cutText(text, max) {
	const characters = [...text];
	return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : text;
}

// Text as an inline code span: GitHub neither links, mentions nor cross-references
// inside code, and a backtick in the text cannot end it, because the span is
// fenced by more backticks than the longest run in the text
export function inlineCode(text) {
	const longest = Math.max(0, ...(text.match(/`+/gv) ?? []).map(run => run.length));
	const fence = '`'.repeat(longest + 1);
	return `${fence} ${text} ${fence}`;
}

/**
 Render the problems of the page as a warning block. The text comes from the page, so it is
 shown as code, verbatim.
 @param {{text: string, count: number}[] | undefined} problems The collected problems.
 @returns {string} The block, or an empty string without problems.
 */
export function renderProblems(problems) {
	if (!problems || problems.length === 0) {
		return '';
	}

	const shown = problems.slice(0, MAX_PROBLEM_LINES).map(({text, count}) =>
		`- ${inlineCode(cutText(oneLine(text), MAX_PROBLEM_LENGTH))}${repeatNote(count)}`);
	const more = problems.length - shown.length;
	const lines = [
		`The page reported ${problems.length} problem${problems.length === 1 ? '' : 's'} that the logs above do not show:`,
		...shown,
		...more > 0 ? [`- …and ${more} more`] : [],
	];
	return `> [!WARNING]\n${lines.map(line => `> ${line}`).join('\n')}\n\n`;
}

// What a section call puts between its markers: one collapsible group titled with the
// section name. It starts open, the logs are the point of the comment (and plain text, so
// nothing jumps while it loads).
function renderSectionContent(content, section, problems) {
	const group = `<details open>\n<summary><b>${escapeHtml(section.name)}</b></summary>\n\n${content.trim()}\n\n</details>\n`;
	// Outside of the details, so a collapsed section does not hide its problems
	return `${group}\n${renderProblems(problems)}`;
}

/**
 Put one section into the comment of a tag: replace the section of the same slug
 where it is, or add it after the others (the order is the order of first
 insertion), and leave every other section as it was. The headline and the
 footer are the frame of the comment and always come from the given frame; text
 of the previous body outside of the sections is not kept.
 @param {string | undefined} previousBody The body of the earlier comment of the tag (empty or undefined for none).
 @param {string} tag The tag of the comment, as it is written into the markers.
 @param {string} slug The slug of the section (letters, digits and dashes).
 @param {string} sectionMarkdown What goes between the markers of the section.
 @param {{headline: string, footer?: string}} frame The headline (plain text) and the rendered footer, if any.
 @returns {string} The new body, starting with the marker line of the tag.
 */
// eslint-disable-next-line max-params -- the five pieces of a merge, in the order of the section markers
function mergeSection(previousBody, tag, slug, sectionMarkdown, frame) {
	const sections = typeof previousBody === 'string' ? parseSections(previousBody, tag) : [];
	const next = {slug, content: sectionMarkdown.trim()};
	const index = sections.findIndex(section => section.slug === slug);
	if (index === -1) {
		sections.push(next);
	} else {
		sections[index] = next;
	}

	const blocks = sections.map(section => {
		const {start, end} = sectionMarkers(tag, section.slug);
		return `${start}\n${section.content}\n${end}\n\n`;
	});
	return [
		`${commentMarker(tag)}\n`,
		`# ${frame.headline}\n\n`,
		...blocks,
		frame.footer ?? '',
	].join('');
}

/**
 Render the comment: the marker line, the headline, what the format step wrote and the footer.
 With a section only this call's section is rendered, into the body of the earlier comment of the tag.
 @param {{content: string, headline: string, tag: string, footer?: {sha?: string, runUrl?: string} | null, problems?: {text: string, count: number}[], section?: {name: string, slug: string} | null, previousBody?: string}} parts The finished markdown of the logs, the headline (plain text), the tag, the footer, the problems the page reported (shown as a warning after the logs), and for a section its name and slug and the body of the comment that is edited.
 @returns {string} The body, starting with the marker line of the tag (none for an empty tag).
 */
function renderComment({
	content, headline, tag, footer, section, previousBody, problems,
}) {
	if (section) {
		return mergeSection(previousBody, tag, section.slug, renderSectionContent(content, section, problems), {
			headline,
			footer: renderFooter(footer),
		});
	}

	// An empty tag means every run posts a new comment, so there is nothing to find it by
	const marker = tag === '' ? '' : `${commentMarker(tag)}\n`;
	const extras = `${renderProblems(problems)}${renderFooter(footer)}`;
	// A blank line before the problems and the footer, or they would become part of the last paragraph of the logs
	const body = extras === '' ? content : `${content.trimEnd()}\n\n${extras}`;
	return `${marker}# ${headline}\n${body}`;
}

export {
	commentMarker, createMarkerMatcher, legacyMarker, mergeSection, renderComment, renderFooter, startsWithMarker,
};
