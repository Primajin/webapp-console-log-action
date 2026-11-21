import process from 'node:process';
import {promises as fs} from 'node:fs';
import {
	beforeEach,
	afterEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import {chromium} from 'playwright';
import {
	shouldFail,
	shouldCapture,
	filterMessage,
	validateStatusCode,
} from './utils.js';
import {runPreScript} from './pre-script.js';

let consoleListener;

const page = {
	context: vi.fn(() => ({name: 'context'})),
	goto: vi.fn(),
	on: vi.fn(),
	waitForSelector: vi.fn(),
	waitForTimeout: vi.fn(),
};

const browser = {
	close: vi.fn(),
	newPage: vi.fn(async () => page),
};

vi.mock('playwright', () => ({
	chromium: {
		launch: vi.fn(async () => browser),
	},
}));

vi.mock('node:fs', () => ({
	promises: {
		writeFile: vi.fn(),
	},
}));

vi.mock('./pre-script.js', () => ({
	runPreScript: vi.fn(async () => false),
}));

vi.mock('./utils.js', async importOriginal => {
	const {buildCaptureUrl} = await importOriginal();
	return {
		buildCaptureUrl,
		filterMessage: vi.fn((level, message) => message),
		logLevels: ['verbose', 'info', 'warning', 'error'],
		shouldCapture: vi.fn(() => true),
		shouldFail: vi.fn(() => false),
		validateStatusCode: vi.fn(() => ({ok: true, reason: ''})),
	};
});

describe('index.js', () => {
	beforeEach(() => {
		consoleListener = undefined;
		page.context.mockReturnValue({name: 'context'});
		page.goto.mockReset();
		page.on.mockReset();
		page.waitForTimeout.mockReset();
		page.waitForSelector.mockReset();
		browser.close.mockReset();
		browser.newPage.mockClear();
		vi.mocked(chromium.launch).mockClear();
		vi.mocked(fs.writeFile).mockClear();
		vi.mocked(runPreScript).mockReset();
		vi.mocked(runPreScript).mockResolvedValue(false);
		vi.mocked(shouldFail).mockReset();
		vi.mocked(shouldFail).mockReturnValue(false);
		vi.mocked(shouldCapture).mockReset();
		vi.mocked(shouldCapture).mockReturnValue(true);
		vi.mocked(validateStatusCode).mockReset();
		vi.mocked(validateStatusCode).mockReturnValue({ok: true, reason: ''});
		vi.mocked(filterMessage).mockReset();
		vi.mocked(filterMessage).mockImplementation((level, message) => message);
		vi.unstubAllEnvs();
		vi.resetModules();

		page.on.mockImplementation((event, callback) => {
			if (event === 'console') {
				consoleListener = callback;
			}
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	test('should capture console messages and write to file', async () => {
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Test message'});
		});

		await import('./index.js');

		expect(page.goto).toHaveBeenCalled();
		expect(page.waitForTimeout).toHaveBeenCalled();
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Test message']}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 1}, null, 2));
	});

	test('should handle different log levels', async () => {
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'error', text: () => 'Error message'});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({error: ['Error message']}, null, 2));
	});

	test('should not capture empty console messages', async () => {
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'only one message should be there'});
			consoleListener({type: () => 'log', text: () => ''});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['only one message should be there']}, null, 2));
	});

	test('should not capture messages below the configured minimum log level', async () => {
		vi.mocked(shouldCapture).mockReturnValue(false);
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'This should not be captured'});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 1}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({}, null, 2));
		expect(filterMessage).not.toHaveBeenCalled();
	});

	test('should set shouldFailAction based on log level', async () => {
		vi.mocked(shouldFail).mockImplementation(level => level === 'error');
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'error', text: () => 'Error message'});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalled();
		expect(process.env.SHOULD_FAIL_ACTION).toBe('true');
	});

	test('should handle different environment variables', async () => {
		vi.stubEnv('PORT', '3000');
		vi.stubEnv('WAIT_TIME', '1000');
		vi.stubEnv('WEBAPP_URL', 'https://example.com');

		await import('./index.js');

		expect(page.goto).toHaveBeenCalledWith('https://example.com:3000/', {waitUntil: 'load'});
		expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
	});

	test('should refuse an invalid port instead of opening the page', async () => {
		vi.stubEnv('PORT', '3000;id');
		vi.stubEnv('WEBAPP_URL', 'http://localhost');

		await expect(import('./index.js')).rejects.toThrow('Invalid port "3000;id"');
		expect(page.goto).not.toHaveBeenCalled();
	});

	test('should run pre-script before capturing later logs', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Ignored before capture'});
		});
		page.waitForTimeout.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Captured after pre-script'});
		});

		await import('./index.js');

		expect(runPreScript).toHaveBeenCalledWith(expect.objectContaining({
			browser,
			context: {name: 'context'},
			page,
			startCapture: expect.any(Function),
			url: 'http://localhost',
		}));
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Captured after pre-script']}, null, 2));
	});

	test('should let the pre-script start capture before it finishes', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Ignored before login'});
		});
		vi.mocked(runPreScript).mockImplementation(async ({startCapture}) => {
			await startCapture();
			consoleListener({type: () => 'log', text: () => 'Captured during pre-script'});
			return true;
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Captured during pre-script']}, null, 2));
	});

	test('should report a failing pre-script instead of crashing and write empty output files', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Ignored before capture'});
		});
		vi.mocked(runPreScript).mockRejectedValue(new Error('Failed to execute pre-script "./login.js": boom', {cause: new Error('boom')}));

		await expect(import('./index.js')).resolves.toBeDefined();

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 0}, null, 2));
		expect(browser.close).toHaveBeenCalledTimes(1);
		expect(process.env.SHOULD_FAIL_ACTION).toBe('true');
		expect(process.env.SHOULD_FAIL_REASON).toBe('Pre-script failed: boom');
		expect(console.error).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringContaining('boom')}));
	});

	test('should fall back to the error message when the pre-script error has no cause', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(runPreScript).mockRejectedValue(new Error('no cause here'));

		await import('./index.js');

		expect(process.env.SHOULD_FAIL_REASON).toBe('Pre-script failed: no cause here');
	});

	test('should not wait for the capture window when the pre-script fails', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(runPreScript).mockRejectedValue(new Error('timed out'));

		await import('./index.js');

		expect(page.waitForTimeout).not.toHaveBeenCalled();
	});

	test('should not report a pre-script failure when the pre-script succeeds', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.stubEnv('SHOULD_FAIL_REASON', '');
		page.waitForTimeout.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Captured after pre-script'});
		});

		await import('./index.js');

		expect(process.env.SHOULD_FAIL_REASON).toBe('');
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Captured after pre-script']}, null, 2));
	});

	test('should write totalObserved 0 when there are no messages at all', async () => {
		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 0}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({}, null, 2));
	});

	test('should write totalObserved > 0 even when all messages are filtered out', async () => {
		vi.mocked(filterMessage).mockReturnValue(''); // Everything filtered out
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'This gets filtered'});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 1}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({}, null, 2));
	});

	test('should fail early on non-200 HTTP status and write empty output files', async () => {
		vi.mocked(validateStatusCode).mockReturnValue({
			ok: false,
			reason: 'HTTP status 404 is not in the configured positive status codes (200).',
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({}, null, 2));
		expect(fs.writeFile).toHaveBeenCalledWith('capture_stats.json', JSON.stringify({totalObserved: 0}, null, 2));
		expect(browser.close).toHaveBeenCalled();
		expect(process.env.SHOULD_FAIL_ACTION).toBe('true');
		expect(process.env.SHOULD_FAIL_REASON).toContain('404');
	});

	test('should not run pre-script or wait when HTTP status check fails', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.mocked(validateStatusCode).mockReturnValue({
			ok: false,
			reason: 'HTTP status 500 is not in the configured positive status codes (200).',
		});

		await import('./index.js');

		expect(runPreScript).not.toHaveBeenCalled();
		expect(page.waitForTimeout).not.toHaveBeenCalled();
	});

	test('should continue normally when HTTP status check passes with custom positive code', async () => {
		vi.mocked(validateStatusCode).mockReturnValue({ok: true, reason: ''});
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Page loaded fine'});
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Page loaded fine']}, null, 2));
		expect(browser.close).toHaveBeenCalled();
	});

	test('should pass the response status to validateStatusCode', async () => {
		const mockResponse = {status: vi.fn(() => 404)};
		page.goto.mockResolvedValue(mockResponse);

		await import('./index.js');

		expect(validateStatusCode).toHaveBeenCalledWith(404);
	});

	test('should call validateStatusCode with 0 when response is null', async () => {
		page.goto.mockResolvedValue(null);

		await import('./index.js');

		expect(validateStatusCode).toHaveBeenCalledWith(0);
	});

	test('should navigate with the load event unless wait-until says otherwise', async () => {
		await import('./index.js');

		expect(page.goto).toHaveBeenCalledWith('http://localhost', {waitUntil: 'load'});
	});

	test.each([
		['domcontentloaded', 'domcontentloaded'],
		['NETWORKIDLE', 'networkidle'],
		['networkidle0', 'networkidle'],
		['commit', 'commit'],
	])('should navigate with wait-until %s as %s', async (input, expected) => {
		vi.stubEnv('WAIT_UNTIL', input);

		await import('./index.js');

		expect(page.goto).toHaveBeenCalledWith('http://localhost', {waitUntil: expected});
	});

	test('should warn about an unknown wait-until and use load', async () => {
		vi.stubEnv('WAIT_UNTIL', 'whenever');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		await import('./index.js');

		expect(warn).toHaveBeenCalledWith('Unknown wait-until "whenever", using "load".');
		expect(page.goto).toHaveBeenCalledWith('http://localhost', {waitUntil: 'load'});
		warn.mockRestore();
	});

	test('should still wait for wait-time on top of wait-until', async () => {
		vi.stubEnv('WAIT_UNTIL', 'networkidle');
		vi.stubEnv('WAIT_TIME', '1234');

		await import('./index.js');

		expect(page.waitForTimeout).toHaveBeenCalledWith(1234);
	});

	test('should not wait for a selector unless one is set', async () => {
		await import('./index.js');

		expect(page.waitForSelector).not.toHaveBeenCalled();
	});

	test('should wait for the selector with the given state and timeout before the wait time', async () => {
		vi.stubEnv('WAIT_FOR_SELECTOR', '#ready');
		vi.stubEnv('WAIT_FOR_SELECTOR_VISIBLE', 'true');
		vi.stubEnv('WAIT_FOR_SELECTOR_TIMEOUT', '5000');
		const order = [];
		page.waitForSelector.mockImplementation(async () => {
			order.push('selector');
		});
		page.waitForTimeout.mockImplementation(async () => {
			order.push('wait-time');
		});

		await import('./index.js');

		expect(page.waitForSelector).toHaveBeenCalledWith('#ready', {state: 'visible', timeout: 5000});
		expect(order).toEqual(['selector', 'wait-time']);
	});

	test('should wait for the selector to be hidden', async () => {
		vi.stubEnv('WAIT_FOR_SELECTOR', '.spinner');
		vi.stubEnv('WAIT_FOR_SELECTOR_HIDDEN', 'true');

		await import('./index.js');

		expect(page.waitForSelector).toHaveBeenCalledWith('.spinner', {state: 'hidden', timeout: 30_000});
	});

	test('should wait for the selector after the pre-script, and capture the logs of the wait', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', './login.js');
		vi.stubEnv('WAIT_FOR_SELECTOR', '#secure');
		const order = [];
		vi.mocked(runPreScript).mockImplementation(async () => {
			order.push('pre-script');
			return false;
		});
		page.waitForSelector.mockImplementation(async () => {
			order.push('selector');
			consoleListener({type: () => 'log', text: () => 'Logged while waiting'});
		});

		await import('./index.js');

		expect(order).toEqual(['pre-script', 'selector']);
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Logged while waiting']}, null, 2));
	});

	test('should go on capturing when the selector is never reached', async () => {
		vi.stubEnv('WAIT_FOR_SELECTOR', '#never');
		vi.stubEnv('SHOULD_FAIL_ACTION', '');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		page.waitForSelector.mockRejectedValue(new Error('Timeout 30000ms exceeded'));
		page.goto.mockImplementation(async () => {
			consoleListener({type: () => 'log', text: () => 'Before the timeout'});
		});

		await import('./index.js');

		expect(page.waitForTimeout).toHaveBeenCalled();
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify({info: ['Before the timeout']}, null, 2));
		expect(process.env.SHOULD_FAIL_ACTION).not.toBe('true');
	});

	test('should not wait for the selector when the HTTP status check fails', async () => {
		vi.stubEnv('WAIT_FOR_SELECTOR', '#ready');
		vi.mocked(validateStatusCode).mockReturnValue({ok: false, reason: 'HTTP status 500 is not in the configured positive status codes (200).'});

		await import('./index.js');

		expect(page.waitForSelector).not.toHaveBeenCalled();
	});
});
