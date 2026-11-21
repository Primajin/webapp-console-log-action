import {describe, expect, test} from 'vitest';
import {
	commentMarker,
	createMarkerMatcher,
	legacyMarker,
	renderComment,
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
