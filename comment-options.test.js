import {describe, expect, test} from 'vitest';
import {DEFAULT_COMMENT_OPTIONS, resolveCommentOptions} from './comment-options.js';

/**
 Resolves options from a plain object of inputs.
 @param {{[key: string]: string}} inputs - The inputs that are set.
 @returns {ReturnType<typeof resolveCommentOptions>} - The resolved options and warnings.
 */
const resolve = (inputs = {}) => resolveCommentOptions(name => inputs[name]);

describe('resolveCommentOptions', () => {
	test('uses the defaults when nothing is set', () => {
		const {options, warnings} = resolve();
		expect(options).toEqual({
			comment: true, footer: true, mode: 'update', tag: 'console-log', markerTag: 'console-log', headline: 'Console Logs',
		});
		expect(options.tag).toBe(DEFAULT_COMMENT_OPTIONS.tag);
		expect(warnings).toEqual([]);
	});

	test('treats an empty comment-mode as the default and is case-insensitive', () => {
		expect(resolve({'comment-mode': ''}).options.mode).toBe('update');
		expect(resolve({'comment-mode': ' NEW '}).options.mode).toBe('new');
	});

	test('warns about an unknown comment-mode and falls back', () => {
		const {options, warnings} = resolve({'comment-mode': 'replace'});
		expect(options.mode).toBe('update');
		expect(warnings).toEqual(['Unknown comment-mode "replace"; use update, new. Using "update".']);
	});

	test('keeps an empty comment-tag empty, because it means always a new comment', () => {
		const {options, warnings} = resolve({'comment-tag': ''});
		expect(options.tag).toBe('');
		expect(options.markerTag).toBe('');
		expect(warnings).toEqual([]);
	});

	test('keeps a tag as written for the legacy marker and sanitizes it for the new one', () => {
		const {options, warnings} = resolve({'comment-tag': 'a-->b'});
		expect(options.tag).toBe('a-->b');
		expect(options.markerTag).toBe('a---b');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('comment-tag "a-->b"');
	});

	test('uses the headline input, trimmed', () => {
		expect(resolve({headline: '  My logs '}).options.headline).toBe('My logs');
		expect(resolve({headline: ' '.repeat(3)}).options.headline).toBe('Console Logs');
	});

	test.each(['comment', 'comment-footer'])('switches %s off for false, 0, no and off in any case', name => {
		const key = name === 'comment' ? 'comment' : 'footer';
		for (const value of ['false', '0', 'no', 'off', ' FALSE ', 'Off']) {
			expect(resolve({[name]: value}).options[key], value).toBe(false);
		}

		for (const value of ['true', '1', 'yes', 'on', '', undefined]) {
			const {options, warnings} = resolve({[name]: value});
			expect(options[key], String(value)).toBe(true);
			expect(warnings).toEqual([]);
		}
	});

	test.each(['comment', 'comment-footer'])('warns about a typo in %s and keeps it on', name => {
		const {options, warnings} = resolve({[name]: 'fasle'});
		expect(options.comment && options.footer).toBe(true);
		expect(warnings).toEqual([`Unknown ${name} "fasle"; use true or false. Using "true".`]);
	});
});
