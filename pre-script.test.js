// Kept identical in Primajin/screenshots-ci-action and Primajin/webapp-console-log-action: change both copies together.
import {
	mkdir,
	mkdtemp,
	rm,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	afterEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';
import {
	getPreScriptTimeout,
	loadPreScript,
	resolvePreScriptPath,
	runPreScript,
} from './pre-script.js';

afterEach(() => {
	vi.unstubAllEnvs();
});

const writePreScript = async source => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'pre-script-test-'));
	const filePath = path.join(directory, 'login-script.mjs');
	await writeFile(filePath, source);
	return {directory, filePath};
};

const args = (overrides = {}) => ({
	browser: {},
	context: {},
	page: {},
	startCapture: vi.fn(),
	url: 'https://example.com',
	...overrides,
});

describe('resolvePreScriptPath', () => {
	test('should resolve repo-relative paths from the workspace', () => {
		vi.stubEnv('GITHUB_WORKSPACE', '/workspace/repo');
		expect(resolvePreScriptPath('scripts/login.mjs')).toBe(
			'/workspace/repo/scripts/login.mjs',
		);
	});

	test('should leave absolute paths unchanged', () => {
		expect(resolvePreScriptPath('/tmp/login.mjs')).toBe('/tmp/login.mjs');
	});
});

describe('getPreScriptTimeout', () => {
	test('should use the configured timeout', () => {
		vi.stubEnv('PRE_SCRIPT_TIMEOUT', '1500');
		expect(getPreScriptTimeout()).toBe(1500);
	});

	test('should use the default timeout when the variable is not set', () => {
		vi.stubEnv('PRE_SCRIPT_TIMEOUT', undefined);
		expect(getPreScriptTimeout()).toBe(30_000);
	});

	test.each(['invalid', '', '0', '-5'])(
		'should fall back to the default timeout for "%s"',
		value => {
			vi.stubEnv('PRE_SCRIPT_TIMEOUT', value);
			expect(getPreScriptTimeout()).toBe(30_000);
		},
	);
});

describe('loadPreScript', () => {
	test('should load the default export from the script file', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async () => "loaded";',
		);

		try {
			const preScript = await loadPreScript(filePath);
			await expect(preScript()).resolves.toBe('loaded');
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should reject files without a default export function', async () => {
		const {directory, filePath} = await writePreScript(
			'export const hello = "world";',
		);

		try {
			await expect(loadPreScript(filePath)).rejects.toThrow(
				`Pre-script "${filePath}" must export a default async function.`,
			);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should reject a missing file', async () => {
		await expect(
			loadPreScript('/nonexistent/pre-script.mjs'),
		).rejects.toThrow();
	});
});

describe('runPreScript', () => {
	test('should return false when no pre-script is configured', async () => {
		await expect(runPreScript(args())).resolves.toBe(false);
	});

	test('should pass browser, context, page and url to the pre-script', async () => {
		const {directory, filePath} = await writePreScript(`
      export default async ({browser, context, page, url}) => {
        if (browser.id !== 1 || context.id !== 2 || page.id !== 3) {
          throw new Error('unexpected objects');
        }
        if (url !== 'https://example.com') {
          throw new Error('unexpected url');
        }
      };
    `);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(
				runPreScript(
					args({browser: {id: 1}, context: {id: 2}, page: {id: 3}}),
				),
			).resolves.toBe(false);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should report and forward startCapture when the pre-script calls it', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async ({startCapture}) => startCapture();',
		);
		const startCapture = vi.fn();
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(runPreScript(args({startCapture}))).resolves.toBe(true);
			expect(startCapture).toHaveBeenCalledTimes(1);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should work without a startCapture callback', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async ({startCapture}) => startCapture();',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(
				runPreScript(args({startCapture: undefined})),
			).resolves.toBe(true);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should wrap errors thrown by the pre-script', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async () => { throw new Error("login failed"); };',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(runPreScript(args())).rejects.toThrow(
				`Failed to execute pre-script "${filePath}": login failed`,
			);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should keep the original error as the cause', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async () => { throw new Error("login failed"); };',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			const error = await runPreScript(args()).catch(error_ => error_);
			expect(error.cause).toBeInstanceOf(Error);
			expect(error.cause.message).toBe('login failed');
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should fail when the pre-script times out', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async () => new Promise(() => {});',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);
		vi.stubEnv('PRE_SCRIPT_TIMEOUT', '10');

		try {
			await expect(runPreScript(args())).rejects.toThrow(
				`Failed to execute pre-script "${filePath}": Pre-script "${filePath}" timed out after 10 ms.`,
			);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should prefix import-time errors (syntax error)', async () => {
		const {directory, filePath} = await writePreScript(
			'export default async () => {',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(runPreScript(args())).rejects.toThrow(
				`Failed to execute pre-script "${filePath}": `,
			);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should prefix a missing file error', async () => {
		vi.stubEnv('PRE_SCRIPT_PATH', '/nonexistent/pre-script.mjs');
		await expect(runPreScript(args())).rejects.toThrow(
			'Failed to execute pre-script "/nonexistent/pre-script.mjs": ',
		);
	});

	test('should prefix a missing default export error', async () => {
		const {directory, filePath} = await writePreScript(
			'export const hello = "world";',
		);
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(runPreScript(args())).rejects.toThrow(
				`Failed to execute pre-script "${filePath}": Pre-script "${filePath}" must export a default async function.`,
			);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	describe('timer cleanup', () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		test('should clear the timeout timer after the pre-script resolves', async () => {
			const {directory, filePath} = await writePreScript(
				'export default async () => {};',
			);
			vi.stubEnv('PRE_SCRIPT_PATH', filePath);
			vi.useFakeTimers();

			try {
				await runPreScript(args());
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				await rm(directory, {force: true, recursive: true});
			}
		});

		test('should clear the timeout timer after the pre-script rejects', async () => {
			const {directory, filePath} = await writePreScript(
				'export default async () => { throw new Error("nope"); };',
			);
			vi.stubEnv('PRE_SCRIPT_PATH', filePath);
			vi.useFakeTimers();

			try {
				await expect(runPreScript(args())).rejects.toThrow(
					`Failed to execute pre-script "${filePath}": nope`,
				);
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				await rm(directory, {force: true, recursive: true});
			}
		});
	});

	test('should execute relative script paths from GITHUB_WORKSPACE', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'workspace-'));
		const filePath = path.join(directory, 'scripts', 'login.mjs');
		await mkdir(path.dirname(filePath), {recursive: true});
		await writeFile(
			filePath,
			'export default async ({startCapture}) => startCapture();',
		);
		vi.stubEnv('GITHUB_WORKSPACE', directory);
		vi.stubEnv('PRE_SCRIPT_PATH', 'scripts/login.mjs');

		try {
			await expect(runPreScript(args())).resolves.toBe(true);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});
});
