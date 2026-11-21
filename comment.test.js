import {describe, expect, test} from 'vitest';
import {
	commentMarker,
	createMarkerMatcher,
	legacyMarker,
	mergeSection,
	renderComment,
	renderFooter,
	renderProblems,
	startsWithMarker,
} from './comment.js';

describe('comment markers', () => {
	test('puts the marker of the tag on the first line, before the headline and the logs', () => {
		const body = renderComment({content: '## Info\n```\nhi\n```\n', headline: 'Console Logs', tag: 'console-log'});
		expect(body).toBe('<!-- webapp-console-log-action:console-log -->\n# Console Logs\n## Info\n```\nhi\n```\n');
	});

	test('writes no marker for an empty tag, which always posts a new comment', () => {
		expect(renderComment({content: 'x\n', headline: 'H', tag: ''})).toBe('# H\nx\n');
	});

	test('recognises the marker only as the first line', () => {
		const marker = commentMarker('a');
		expect(startsWithMarker(marker, marker)).toBe(true);
		expect(startsWithMarker(`${marker}\n# H`, marker)).toBe(true);
		expect(startsWithMarker(`${marker}\r\n# H`, marker)).toBe(true);
		expect(startsWithMarker(`text\n${marker}`, marker)).toBe(false);
		expect(startsWithMarker(`${marker}x`, marker)).toBe(false);
	});

	test('does not mix up tags that start alike', () => {
		const isMarked = createMarkerMatcher('console-log');
		expect(isMarked(renderComment({content: '', headline: 'H', tag: 'console-log'}))).toBe(true);
		expect(isMarked(renderComment({content: '', headline: 'H', tag: 'console-log-2'}))).toBe(false);
	});

	test('finds a comment of an earlier version, which carries the thollander marker at the end', () => {
		const earlier = `# Console Logs\n✅ No logs were captured\n\n${legacyMarker('console-log')}`;
		expect(legacyMarker('console-log')).toBe('<!-- Sticky Pull Request Commentconsole-log -->');
		expect(createMarkerMatcher('console-log')(earlier)).toBe(true);
		expect(createMarkerMatcher('other')(earlier)).toBe(false);
		// ...and not the legacy comment of a tag the new one merely starts with
		const longer = `# H\n${legacyMarker('console-log-2')}`;
		expect(createMarkerMatcher('console-log')(longer)).toBe(false);
	});

	test('looks for the legacy marker with the tag as written, the new marker with the sanitized one', () => {
		const isMarked = createMarkerMatcher('a/b', 'a-b');
		expect(isMarked(renderComment({content: '', headline: 'H', tag: 'a-b'}))).toBe(true);
		expect(isMarked(`# H\n${legacyMarker('a/b')}`)).toBe(true);
		expect(isMarked(`# H\n${legacyMarker('a-b')}`)).toBe(false);
	});
});

describe('comment footer', () => {
	test('shows the short commit and a link to the workflow run', () => {
		expect(renderFooter({sha: 'abcdef0123456789', runUrl: 'https://github.com/o/r/actions/runs/1'}))
			.toBe('<sub>Commit abcdef0 · [workflow run](https://github.com/o/r/actions/runs/1)</sub>\n');
	});

	test('shows what it has, and nothing when it has nothing', () => {
		expect(renderFooter({sha: 'abcdef0123'})).toBe('<sub>Commit abcdef0</sub>\n');
		expect(renderFooter({runUrl: 'https://x/y'})).toBe('<sub>[workflow run](https://x/y)</sub>\n');
		expect(renderFooter({})).toBe('');
		expect(renderFooter(null)).toBe('');
		expect(renderFooter()).toBe('');
	});

	test('leaves a blank line between the logs and the footer, however the logs end', () => {
		const footer = {sha: 'abcdef0'};
		for (const content of ['text\n', 'text\n\n', '```\n\n\n']) {
			const body = renderComment({
				content, headline: 'H', tag: 't', footer,
			});
			expect(body.endsWith(`${content.trimEnd()}\n\n<sub>Commit abcdef0</sub>\n`), JSON.stringify(content)).toBe(true);
		}
	});

	test('leaves the body as it was without a footer', () => {
		expect(renderComment({
			content: 'x\n', headline: 'H', tag: 't', footer: null,
		})).toBe('<!-- webapp-console-log-action:t -->\n# H\nx\n');
	});
});

describe('comment sections', () => {
	const section = {name: 'Home <page>', slug: 'home-page'};
	const sectionComment = (name, slug, content, previousBody) => renderComment({
		content, headline: 'H', tag: 't', footer: {sha: 'abcdef0'}, section: {name, slug}, previousBody,
	});

	test('wraps the logs of a section in markers and a titled details, with the headline and footer around', () => {
		expect(renderComment({
			content: '## Info\n```\nhi\n```\n', headline: 'H', tag: 't', footer: {sha: 'abcdef0'}, section,
		})).toBe([
			'<!-- webapp-console-log-action:t -->',
			'# H',
			'',
			'<!-- webapp-console-log-action:t:section:home-page -->',
			'<details open>',
			'<summary><b>Home &lt;page&gt;</b></summary>',
			'',
			'## Info',
			'```',
			'hi',
			'```',
			'',
			'</details>',
			'<!-- /webapp-console-log-action:t:section:home-page -->',
			'',
			'<sub>Commit abcdef0</sub>',
			'',
		].join('\n'));
	});

	test('adds a second section after the first and keeps the first as it was', () => {
		const first = sectionComment('Home', 'home', 'home logs\n');
		const both = sectionComment('Login', 'login', 'login logs\n', first);
		expect(both.indexOf('home logs')).toBeGreaterThan(-1);
		expect(both.indexOf('login logs')).toBeGreaterThan(both.indexOf('home logs'));
		expect(both.match(/<!-- webapp-console-log-action:t:section:/gv)).toHaveLength(2);
	});

	test('replaces only its own section, in place, when a call runs again', () => {
		const first = sectionComment('Home', 'home', 'home v1\n');
		const both = sectionComment('Login', 'login', 'login v1\n', first);
		const again = sectionComment('Home', 'home', 'home v2\n', both);
		expect(again).toContain('home v2');
		expect(again).not.toContain('home v1');
		expect(again).toContain('login v1');
		expect(again.indexOf('home v2')).toBeLessThan(again.indexOf('login v1'));
	});

	test('takes headline and footer from the latest call and keeps no text outside of the sections', () => {
		const earlier = `${sectionComment('Home', 'home', 'x\n')}\nhand written text\n`;
		const merged = mergeSection(earlier, 't', 'login', 'login\n', {headline: 'New headline', footer: '<sub>new</sub>\n'});
		expect(merged).toContain('# New headline\n');
		expect(merged).not.toContain('# H\n');
		expect(merged).not.toContain('hand written text');
		expect(merged.endsWith('<sub>new</sub>\n')).toBe(true);
		expect(merged).not.toContain('Commit abcdef0');
	});

	test('does not take a start marker without its end marker for a section', () => {
		const broken = '<!-- webapp-console-log-action:t:section:home -->\nhome logs\n';
		const result = sectionComment('Login', 'login', 'login logs\n', broken);
		expect(result).not.toContain('home logs');
		expect(result).toContain('login logs');
	});

	test('does not take a truncated start marker for a section', () => {
		const result = sectionComment('Login', 'login', 'login logs\n', '<!-- webapp-console-log-action:t:section:home');
		expect(result).toContain('login logs');
		expect(result).not.toContain(':section:home');
	});

	test('starts a fresh comment from a previous body that has no sections, such as a whole comment or a thollander one', () => {
		const whole = renderComment({content: 'whole\n', headline: 'H', tag: 't'});
		expect(sectionComment('Home', 'home', 'home\n', whole)).not.toContain('whole');
		expect(sectionComment('Home', 'home', 'home\n', `# H\nold\n${legacyMarker('t')}`)).not.toContain('old');
	});

	test('does not take over the sections of another tag', () => {
		const other = mergeSection(undefined, 'other', 'home', 'other home\n', {headline: 'H'});
		expect(sectionComment('Login', 'login', 'login\n', other)).not.toContain('other home');
	});

	test('drops a section whose end marker is missing instead of swallowing the rest', () => {
		const broken = [
			'<!-- webapp-console-log-action:t -->',
			'<!-- webapp-console-log-action:t:section:broken -->',
			'no end marker',
			mergeSection(undefined, 't', 'good', 'good logs\n', {headline: 'H'}),
		].join('\n');
		const merged = sectionComment('Login', 'login', 'login\n', broken);
		expect(merged).toContain('good logs');
		expect(merged).not.toContain('no end marker');
	});

	test('keeps the first of two sections with the same slug and ignores a slug that is not one', () => {
		const first = mergeSection(undefined, 't', 'home', 'first\n', {headline: 'H'});
		const duplicated = `${first}${mergeSection(undefined, 't', 'home', 'second\n', {headline: 'H'})}`;
		const merged = sectionComment('Login', 'login', 'login\n', duplicated);
		expect(merged).toContain('first');
		expect(merged).not.toContain('second');
		const bad = '<!-- webapp-console-log-action:t:section:a b -->\nx\n<!-- /webapp-console-log-action:t:section:a b -->';
		expect(sectionComment('Login', 'login', 'login\n', bad)).not.toContain('\nx\n');
	});
});

describe('comment problems', () => {
	const problems = [{text: 'pageerror: boom', count: 1}, {text: 'console: Failed to load resource', count: 3}];

	test('shows nothing without problems', () => {
		expect(renderProblems()).toBe('');
		expect(renderProblems([])).toBe('');
	});

	test('shows them as one warning block of code spans, with how often they repeated', () => {
		expect(renderProblems(problems)).toBe([
			'> [!WARNING]',
			'> The page reported 2 problems that the logs above do not show:',
			'> - ` pageerror: boom `',
			'> - ` console: Failed to load resource ` (3 times)',
			'',
			'',
		].join('\n'));
		expect(renderProblems([problems[0]])).toContain('The page reported 1 problem that');
	});

	test('keeps page text from breaking out of its code span, line or the quote', () => {
		const block = renderProblems([{text: 'a ``` b `` c\n> d', count: 1}]);
		expect(block).toContain('> - ```` a ``` b `` c > d ````');
	});

	test('cuts a long text and shows only the first ten problems, then how many more', () => {
		expect(renderProblems([{text: 'x'.repeat(400), count: 1}])).toContain(`${'x'.repeat(299)}…`);
		const many = Array.from({length: 13}, (_, index) => ({text: `p${index}`, count: 1}));
		const block = renderProblems(many);
		expect(block).toContain('The page reported 13 problems');
		expect(block).toContain('p9');
		expect(block).not.toContain('p10');
		expect(block).toContain('> - …and 3 more');
	});

	test('puts the problems after the logs and before the footer, with blank lines between', () => {
		const body = renderComment({
			content: '## Error\n```\nbad\n```\n\n', headline: 'H', tag: 't', footer: {sha: 'abcdef0'}, problems,
		});
		expect(body).toContain('```\n\n> [!WARNING]\n');
		expect(body.indexOf('> [!WARNING]')).toBeLessThan(body.indexOf('<sub>'));
		expect(body).toContain('(3 times)\n\n<sub>Commit abcdef0</sub>\n');
	});

	test('puts the problems of a section into the section, below its collapsible logs', () => {
		const body = renderComment({
			content: 'logs\n', headline: 'H', tag: 't', section: {name: 'Home', slug: 'home'}, problems,
		});
		const start = body.indexOf(':section:home -->');
		const end = body.indexOf('<!-- /webapp-console-log-action:t:section:home -->');
		expect(body.indexOf('</details>')).toBeGreaterThan(start);
		expect(body.indexOf('> [!WARNING]')).toBeGreaterThan(body.indexOf('</details>'));
		expect(body.indexOf('> [!WARNING]')).toBeLessThan(end);
	});

	test('leaves the comment as it was without problems', () => {
		expect(renderComment({
			content: 'x\n', headline: 'H', tag: 't', problems: [],
		})).toBe('<!-- webapp-console-log-action:t -->\n# H\nx\n');
	});
});
