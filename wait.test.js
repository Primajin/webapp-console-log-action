import {
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import {
	DEFAULT_WAITUNTIL_OPTION,
	DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT,
	buildSelectorWaitOptions,
	describeWaitUntil,
	mapWaitUntil,
	waitForConfiguredSelector,
} from './wait.js';

describe('mapWaitUntil', () => {
	test('defaults to load, which is what page.goto waits for without an option', () => {
		expect(DEFAULT_WAITUNTIL_OPTION).toBe('load');
		for (const input of [undefined, '', ' '.repeat(3)]) {
			expect(mapWaitUntil(input)).toEqual({value: 'load', fallback: false});
		}
	});

	test.each(['load', 'domcontentloaded', 'networkidle', 'commit'])('passes %s through, in any case', value => {
		expect(mapWaitUntil(value)).toEqual({value, fallback: false});
		expect(mapWaitUntil(` ${value.toUpperCase()} `)).toEqual({value, fallback: false});
	});

	test.each(['networkidle0', 'networkidle2'])('maps the legacy Puppeteer value %s to networkidle', value => {
		expect(mapWaitUntil(value)).toEqual({value: 'networkidle', fallback: false, mappedFrom: value});
	});

	test('falls back to the default for an unknown value', () => {
		expect(mapWaitUntil('whenever')).toEqual({value: 'load', fallback: true});
		// Not mistaken for an inherited property of the legacy map
		expect(mapWaitUntil('constructor')).toEqual({value: 'load', fallback: true});
	});
});

describe('describeWaitUntil', () => {
	test('warns for an unknown value and notices a legacy one', () => {
		expect(describeWaitUntil('whenever', mapWaitUntil('whenever'))).toEqual({
			warning: 'Unknown wait-until "whenever", using "load".',
			notice: undefined,
		});
		expect(describeWaitUntil('networkidle0', mapWaitUntil('networkidle0'))).toEqual({
			warning: undefined,
			notice: 'wait-until "networkidle0" is a legacy Puppeteer value, using Playwright\'s "networkidle".',
		});
		expect(describeWaitUntil('load', mapWaitUntil('load'))).toEqual({warning: undefined, notice: undefined});
	});
});

describe('buildSelectorWaitOptions', () => {
	test('waits for the element to be attached by default, for 30 seconds', () => {
		expect(buildSelectorWaitOptions()).toEqual({state: 'attached', timeout: 30_000});
		expect(DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT).toBe(30_000);
	});

	test('maps visible and hidden to the state, visible winning', () => {
		expect(buildSelectorWaitOptions({visible: true}).state).toBe('visible');
		expect(buildSelectorWaitOptions({hidden: true}).state).toBe('hidden');
		expect(buildSelectorWaitOptions({visible: true, hidden: true}).state).toBe('visible');
	});

	test('takes a timeout, 0 meaning no timeout, and ignores an invalid or negative one', () => {
		expect(buildSelectorWaitOptions({timeout: '5000'}).timeout).toBe(5000);
		expect(buildSelectorWaitOptions({timeout: 0}).timeout).toBe(0);
		expect(buildSelectorWaitOptions({timeout: '0'}).timeout).toBe(0);
		for (const timeout of ['', '  ', 'abc', '-1', 'Infinity', undefined]) {
			expect(buildSelectorWaitOptions({timeout}).timeout, String(timeout)).toBe(30_000);
		}
	});
});

describe('waitForConfiguredSelector', () => {
	const options = {state: 'visible', timeout: 10};

	test('does not touch the page without a selector', async () => {
		const page = {waitForSelector: vi.fn()};
		expect(await waitForConfiguredSelector(page, '', options)).toBe(false);
		expect(page.waitForSelector).not.toHaveBeenCalled();
	});

	test('waits with the given options and reports that the selector was reached', async () => {
		const page = {waitForSelector: vi.fn(async () => {})};
		expect(await waitForConfiguredSelector(page, '#ready', options)).toBe(false);
		expect(page.waitForSelector).toHaveBeenCalledWith('#ready', options);
	});

	test('logs a timeout and reports it instead of throwing', async () => {
		const error = new Error('Timeout 10ms exceeded');
		const page = {
			waitForSelector: vi.fn(async () => {
				throw error;
			}),
		};
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await waitForConfiguredSelector(page, '#ready', options)).toBe(true);
		expect(spy).toHaveBeenCalledWith(error);
		spy.mockRestore();
	});
});
