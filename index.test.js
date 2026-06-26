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
import {shouldFail, filterMessage} from './utils.js';
import {runPreScript} from './pre-script.js';

let consoleListener;

const page = {
	context: vi.fn(() => ({name: 'context'})),
	goto: vi.fn(),
	on: vi.fn(),
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

vi.mock('./utils.js', () => ({
	filterMessage: vi.fn((level, message) => message),
	logLevels: ['verbose', 'info', 'warning', 'error'],
	shouldCapture: vi.fn(() => true),
	shouldFail: vi.fn(() => false),
}));

describe('index.js', () => {
	beforeEach(() => {
		consoleListener = undefined;
		page.context.mockReturnValue({name: 'context'});
		page.goto.mockReset();
		page.on.mockReset();
		page.waitForTimeout.mockReset();
		browser.close.mockReset();
		browser.newPage.mockClear();
		vi.mocked(chromium.launch).mockClear();
		vi.mocked(fs.writeFile).mockClear();
		vi.mocked(runPreScript).mockReset();
		vi.mocked(runPreScript).mockResolvedValue(false);
		vi.mocked(shouldFail).mockReset();
		vi.mocked(shouldFail).mockReturnValue(false);
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

		expect(page.goto).toHaveBeenCalledWith('https://example.com:3000');
		expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
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
});
