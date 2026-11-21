import {describe, expect, test} from 'vitest';
import {DEFAULT_COMMENT_OPTIONS, resolveCommentOptions, slugifySectionName} from './comment-options.js';

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
			comment: true, footer: true, mode: 'update', tag: 'console-log', markerTag: 'console-log', headline: 'Console Logs', section: null,
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

	test('warns when comment-headline and the deprecated headline differ, and uses comment-headline', () => {
		const {options, warnings} = resolve({'comment-headline': 'New', headline: 'Old'});
		expect(options.headline).toBe('New');
		expect(warnings).toEqual(['Both comment-headline and headline are set; using comment-headline "New". headline is deprecated, remove it.']);
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

describe('comment-section', () => {
	test('is none by default, also when blank', () => {
		expect(resolve().options.section).toBeNull();
		expect(resolve({'comment-section': ' '.repeat(3)}).options.section).toBeNull();
	});

	test('names the section and derives the slug that identifies it', () => {
		const {options, warnings} = resolve({'comment-section': ' Home  Page '});
		expect(options.section).toEqual({name: 'Home Page', slug: 'home-page'});
		expect(warnings).toEqual([]);
	});

	test('treats names that differ only in case, spacing or punctuation as one section', () => {
		const slugs = ['Home Page', 'home-page', '  HOME   page!! '].map(name => resolve({'comment-section': name}).options.section.slug);
		expect(new Set(slugs)).toEqual(new Set(['home-page']));
		expect(slugifySectionName('Über uns')).toBe('über-uns');
	});

	test('keeps a control character out of the title', () => {
		expect(resolve({'comment-section': 'a\nb\tc'}).options.section.name).toBe('a b c');
	});

	test('cuts a name that is too long and says so', () => {
		const {options, warnings} = resolve({'comment-section': 'a'.repeat(100)});
		expect(options.section.name).toBe('a'.repeat(80));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('longer than 80 characters');
	});

	test('fails for a name with no letter or digit, since ignoring it would wipe the other sections', () => {
		expect(() => resolve({'comment-section': '!!!'})).toThrow('has no letters or digits');
	});

	test('is ignored with a warning for comment-mode new', () => {
		const {options, warnings} = resolve({'comment-section': 'Home', 'comment-mode': 'new'});
		expect(options.section).toBeNull();
		expect(warnings).toEqual([expect.stringContaining('comment-section "Home" is ignored with comment-mode new')]);
	});

	test('is ignored with a warning for an empty comment-tag, which always posts a new comment', () => {
		const {options, warnings} = resolve({'comment-section': 'Home', 'comment-tag': ''});
		expect(options.section).toBeNull();
		expect(warnings).toEqual([expect.stringContaining('ignored with an empty comment-tag')]);
	});
});
