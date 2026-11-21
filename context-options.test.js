import {describe, expect, test} from 'vitest';
import {CONTEXT_OPTION_KEYS, resolveContextOptions} from './context-options.js';

// Ported from Primajin/screenshots-ci-action's utils.test.js, so that both actions refuse the same values.

describe('resolveContextOptions', () => {
	test('is empty for an empty or missing input', () => {
		expect(resolveContextOptions('')).toEqual({});
		expect(resolveContextOptions(' \t\n ')).toEqual({});
		expect(resolveContextOptions(undefined)).toEqual({});
		expect(resolveContextOptions(null)).toEqual({});
	});

	test('accepts every allowed key', () => {
		const all = {
			colorScheme: 'dark',
			reducedMotion: 'reduce',
			forcedColors: 'active',
			deviceScaleFactor: 1.5,
			isMobile: true,
			hasTouch: true,
			viewport: {width: 390, height: 844},
			locale: 'de-DE',
			timezoneId: 'Europe/Berlin',
			userAgent: 'my agent/1.0',
		};
		expect(Object.keys(all).toSorted((a, b) => a.localeCompare(b))).toEqual([...CONTEXT_OPTION_KEYS].toSorted((a, b) => a.localeCompare(b)));
		expect(resolveContextOptions(JSON.stringify(all))).toEqual(all);
	});

	test('accepts the documented example and surrounding whitespace', () => {
		expect(resolveContextOptions('\t{"colorScheme": "dark", "reducedMotion": "reduce"}\n'))
			.toEqual({colorScheme: 'dark', reducedMotion: 'reduce'});
	});

	test('accepts every value of the enums', () => {
		for (const colorScheme of ['light', 'dark', 'no-preference']) {
			expect(resolveContextOptions(JSON.stringify({colorScheme}))).toEqual({colorScheme});
		}

		for (const reducedMotion of ['reduce', 'no-preference']) {
			expect(resolveContextOptions(JSON.stringify({reducedMotion}))).toEqual({reducedMotion});
		}

		for (const forcedColors of ['active', 'none']) {
			expect(resolveContextOptions(JSON.stringify({forcedColors}))).toEqual({forcedColors});
		}
	});

	test('accepts false for the booleans', () => {
		expect(resolveContextOptions('{"isMobile": false, "hasTouch": false}')).toEqual({isMobile: false, hasTouch: false});
	});

	test('fails for invalid JSON, naming the input', () => {
		expect(() => resolveContextOptions('{colorScheme: dark}')).toThrow(/context-options is not valid JSON/v);
		expect(() => resolveContextOptions('{"a": ')).toThrow(/not valid JSON/v);
		expect(() => resolveContextOptions('dark')).toThrow(/not valid JSON/v);
	});

	test('fails when the JSON is not an object', () => {
		for (const raw of ['[]', '[{"colorScheme":"dark"}]', '"dark"', '5', 'true', 'null']) {
			expect(() => resolveContextOptions(raw), raw).toThrow(/must be a JSON object/v);
		}
	});

	test('fails for an unknown key and lists the allowed ones', () => {
		const attempt = () => resolveContextOptions('{"colorscheme": "dark"}');
		expect(attempt).toThrow(/unknown option "colorscheme"/v);
		expect(attempt).toThrow(/Allowed: colorScheme, reducedMotion, forcedColors, deviceScaleFactor/v);
	});

	test('refuses options that could break the action or the pre-script session', () => {
		for (const key of ['storageState', 'proxy', 'extraHTTPHeaders', 'permissions', 'recordVideo', 'baseURL', 'screen', 'javaScriptEnabled']) {
			expect(() => resolveContextOptions(JSON.stringify({[key]: 'x'})), key).toThrow(/unknown option/v);
		}
	});

	test('does not accept inherited property names as keys', () => {
		expect(() => resolveContextOptions('{"toString": "x"}')).toThrow(/unknown option "toString"/v);
		expect(() => resolveContextOptions('{"__proto__": {"colorScheme": "dark"}}')).toThrow(/unknown option "__proto__"/v);
	});

	test('fails for a value that is not allowed for an enum', () => {
		expect(() => resolveContextOptions('{"colorScheme": "darkish"}')).toThrow(/"colorScheme" must be one of "light", "dark", "no-preference", got "darkish"/v);
		expect(() => resolveContextOptions('{"colorScheme": null}')).toThrow(/"colorScheme" must be one of/v);
		expect(() => resolveContextOptions('{"reducedMotion": "yes"}')).toThrow(/"reducedMotion" must be one of/v);
		expect(() => resolveContextOptions('{"forcedColors": true}')).toThrow(/"forcedColors" must be one of/v);
	});

	test('fails for a wrong deviceScaleFactor', () => {
		for (const value of ['2', 0, -1, null, true, [2], {}]) {
			expect(() => resolveContextOptions(JSON.stringify({deviceScaleFactor: value})), String(value)).toThrow(/"deviceScaleFactor" must be a number above 0/v);
		}
	});

	test('accepts a fractional deviceScaleFactor', () => {
		expect(resolveContextOptions('{"deviceScaleFactor": 0.5}')).toEqual({deviceScaleFactor: 0.5});
		expect(resolveContextOptions('{"deviceScaleFactor": 2.75}')).toEqual({deviceScaleFactor: 2.75});
	});

	test('fails for booleans that are not booleans', () => {
		for (const key of ['isMobile', 'hasTouch']) {
			for (const value of ['true', 1, 0, null]) {
				expect(() => resolveContextOptions(JSON.stringify({[key]: value})), `${key} ${value}`).toThrow(new RegExp(`"${key}" must be true or false`, 'v'));
			}
		}
	});

	test('fails for strings that are empty or not strings', () => {
		for (const key of ['locale', 'timezoneId', 'userAgent']) {
			for (const value of ['', '  ', 5, null, ['de']]) {
				expect(() => resolveContextOptions(JSON.stringify({[key]: value})), `${key} ${value}`).toThrow(new RegExp(`"${key}" must be a non-empty string`, 'v'));
			}
		}
	});

	test('fails for a viewport that is not {width, height} of positive whole numbers', () => {
		const bad = [
			'"1440x900"',
			'null',
			'[1440, 900]',
			'{"width": 1440}',
			'{"height": 900}',
			'{"width": 0, "height": 900}',
			'{"width": -1, "height": 900}',
			'{"width": 1440.5, "height": 900}',
			'{"width": "1440", "height": 900}',
			'{"width": 1440, "height": 900, "extra": 1}',
		];
		for (const viewport of bad) {
			expect(() => resolveContextOptions(`{"viewport": ${viewport}}`), viewport).toThrow(/"viewport" must be an object like/v);
		}
	});

	test('accepts the limits of the viewport and refuses a viewport above them', () => {
		expect(resolveContextOptions('{"viewport": {"width": 1, "height": 10000}}').viewport).toEqual({width: 1, height: 10_000});
		for (const viewport of ['{"width": 10001, "height": 900}', '{"width": 1440, "height": 10001}', '{"width": 99999999, "height": 1}']) {
			expect(() => resolveContextOptions(`{"viewport": ${viewport}}`), viewport).toThrow('with whole numbers from 1 to 10000');
		}
	});

	test('accepts a deviceScaleFactor up to 5 and refuses one above it', () => {
		expect(resolveContextOptions('{"deviceScaleFactor": 5}')).toEqual({deviceScaleFactor: 5});
		for (const value of [5.01, 6, 100, 1e9]) {
			expect(() => resolveContextOptions(JSON.stringify({deviceScaleFactor: value})), String(value)).toThrow('"deviceScaleFactor" must be a number above 0 and at most 5');
		}
	});

	test('accepts language tags and refuses text the browser would only refuse after it started', () => {
		for (const locale of ['en', 'de-DE', 'en-US', 'zh-Hant-TW', 'sr-Latn-RS', 'pt-BR']) {
			expect(resolveContextOptions(JSON.stringify({locale})).locale, locale).toBe(locale);
		}

		for (const locale of ['de_DE', 'not a locale', 'x', 'en-', '-en', 'de-DE,en', 'en US', '123', 'e']) {
			expect(() => resolveContextOptions(JSON.stringify({locale})), locale).toThrow(`"locale" must be a language tag such as "de-DE", got "${locale}"`);
		}
	});

	test('accepts IANA time zones and refuses unknown ones and UTC offsets', () => {
		for (const timezoneId of ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
			expect(resolveContextOptions(JSON.stringify({timezoneId})).timezoneId, timezoneId).toBe(timezoneId);
		}

		for (const timezoneId of ['Mars/Olympus', 'Europe/Berlinn', 'Berlin', '+01:00', '-0500', 'not a zone', 'Europe/']) {
			expect(() => resolveContextOptions(JSON.stringify({timezoneId})), timezoneId).toThrow(`"timezoneId" must be an IANA time zone such as "Europe/Berlin", got "${timezoneId}"`);
		}
	});

	test('returns a copy of the viewport', () => {
		const result = resolveContextOptions('{"viewport": {"width": 1, "height": 2}}');
		expect(result.viewport).toEqual({width: 1, height: 2});
	});

	test('reports the first problem of several', () => {
		expect(() => resolveContextOptions('{"colorScheme": "dark", "bogus": 1, "isMobile": "x"}')).toThrow(/unknown option "bogus"/v);
	});
});
