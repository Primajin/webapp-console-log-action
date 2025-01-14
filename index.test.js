import {promises as fs} from 'node:fs';
import {chromium} from 'playwright';
import {
	describe, test, expect, vi, beforeEach, afterEach,
} from 'vitest';

vi.mock('playwright', () => ({
	chromium: {
		launch: vi.fn().mockResolvedValue({
			newPage: vi.fn().mockResolvedValue({
				on: vi.fn(),
				goto: vi.fn(),
				waitForTimeout: vi.fn(),
			}),
			close: vi.fn(),
		}),
	},
}));

vi.mock('node:fs', () => ({
	promises: {
		writeFile: vi.fn(),
	},
}));

vi.mock('./utils.js', () => ({
	filterMessage: vi.fn((level, message) => message),
	shouldCapture: vi.fn(() => true),
	shouldFail: vi.fn(() => false),
	logLevels: ['verbose', 'info', 'warning', 'error'],
}));

describe('index.js', async () => {
	let page;
	let browser;

	beforeEach(async () => {
		browser = await chromium.launch();
		page = await browser.newPage();
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	test('should capture console messages and write to file', async () => {
		const consoleMessages = new Map([
			['info', ['Test message']],
		]);

		page.on.mockImplementation((event, callback) => {
			if (event === 'console') {
				callback({type: () => 'log', text: () => 'Test message'});
			}
		});

		await import('./index.js');

		expect(page.goto).toHaveBeenCalled();
		expect(page.waitForTimeout).toHaveBeenCalled();
		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify(Object.fromEntries(consoleMessages), null, 2));
	});

	test('should handle different log levels', async () => {
		const consoleMessages = new Map([
			['error', ['Error message']],
		]);

		page.on.mockImplementation((event, callback) => {
			if (event === 'console') {
				callback({type: () => 'error', text: () => 'Error message'});
			}
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify(Object.fromEntries(consoleMessages), null, 2));
	});

	test('should not capture empty console messages', async () => {
		const consoleMessages = new Map([
			['info', ['only one message should be there']],
		]);

		page.on.mockImplementation((event, callback) => {
			if (event === 'console') {
				callback({type: () => 'log', text: () => 'only one message should be there'});
				callback({type: () => 'log', text: () => ''});
				callback({type: () => 'log', text: () => ''});
				callback({type: () => 'log', text: () => ''});
				callback({type: () => 'log', text: () => ''});
				callback({type: () => 'log', text: () => ''});
			}
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalledWith('console_output.json', JSON.stringify(Object.fromEntries(consoleMessages), null, 2));
	});

	test('should set shouldFailAction based on log level', async () => {
		vi.mock('./utils.js', () => ({
			filterMessage: vi.fn((level, message) => message),
			shouldCapture: vi.fn(() => true),
			shouldFail: vi.fn(level => level === 'error'),
			logLevels: ['verbose', 'info', 'warning', 'error'],
		}));

		page.on.mockImplementation((event, callback) => {
			if (event === 'console') {
				callback({type: () => 'error', text: () => 'Error message'});
			}
		});

		await import('./index.js');

		expect(fs.writeFile).toHaveBeenCalled();
		expect(process.env.SHOULD_FAIL_ACTION).toBe('true');
	});

	test('should handle different environment variables', async () => {
		process.env.PORT = '3000';
		process.env.WAIT_TIME = '1000';
		process.env.WEBAPP_URL = 'http://example.com';

		await import('./index.js');

		expect(page.goto).toHaveBeenCalledWith('http://example.com:3000');
		expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
	});
});
