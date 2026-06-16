import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	afterEach, describe, expect, test, vi,
} from 'vitest';
import {
	getPreScriptTimeout, loadPreScript, resolvePreScriptPath, runPreScript,
} from './pre-script.js';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

const writePreScript = async source => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'pre-script-test-'));
	const filePath = path.join(directory, 'login-script.mjs');
	await writeFile(filePath, source);
	return {directory, filePath};
};

describe('resolvePreScriptPath', () => {
	test('should resolve repo-relative paths from the workspace', () => {
		vi.stubEnv('GITHUB_WORKSPACE', '/workspace/repo');
		expect(resolvePreScriptPath('scripts/login.mjs')).toBe('/workspace/repo/scripts/login.mjs');
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

	test('should fall back to the default timeout', () => {
		vi.stubEnv('PRE_SCRIPT_TIMEOUT', 'invalid');
		expect(getPreScriptTimeout()).toBe(30_000);
	});
});

describe('loadPreScript', () => {
	test('should load the default export from the script file', async () => {
		const {directory, filePath} = await writePreScript('export default async () => "loaded";');

		try {
			const preScript = await loadPreScript(filePath);
			await expect(preScript()).resolves.toBe('loaded');
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should reject files without a default export function', async () => {
		const {directory, filePath} = await writePreScript('export const hello = "world";');

		try {
			await expect(loadPreScript(filePath)).rejects.toThrow(`Pre-script "${filePath}" must export a default async function.`);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});
});

describe('runPreScript', () => {
	test('should return false when no pre-script is configured', async () => {
		await expect(runPreScript({
			browser: {},
			context: {},
			page: {},
			startCapture: vi.fn(),
			url: 'https://example.com',
		})).resolves.toBe(false);
	});

	test('should execute the pre-script and expose startCapture', async () => {
		const {directory, filePath} = await writePreScript(`
			export default async ({startCapture, url}) => {
				if (url !== 'https://example.com') {
					throw new Error('unexpected url');
				}

				await startCapture();
			};
		`);
		const startCapture = vi.fn();
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);

		try {
			await expect(runPreScript({
				browser: {},
				context: {},
				page: {},
				startCapture,
				url: 'https://example.com',
			})).resolves.toBe(true);
			expect(startCapture).toHaveBeenCalledTimes(1);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should fail when the pre-script times out', async () => {
		const {directory, filePath} = await writePreScript('export default async () => new Promise(() => {});');
		vi.stubEnv('PRE_SCRIPT_PATH', filePath);
		vi.stubEnv('PRE_SCRIPT_TIMEOUT', '10');

		try {
			await expect(runPreScript({
				browser: {},
				context: {},
				page: {},
				startCapture: vi.fn(),
				url: 'https://example.com',
			})).rejects.toThrow(`Failed to execute pre-script "${filePath}": Pre-script "${filePath}" timed out after 10 ms.`);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});

	test('should resolve relative script paths from GITHUB_WORKSPACE', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'workspace-'));
		const filePath = path.join(directory, 'scripts', 'login.mjs');
		await mkdir(path.dirname(filePath), {recursive: true});
		await writeFile(filePath, 'export default async () => {};');
		vi.stubEnv('GITHUB_WORKSPACE', directory);
		vi.stubEnv('PRE_SCRIPT_PATH', 'scripts/login.mjs');

		try {
			await expect(runPreScript({
				browser: {},
				context: {},
				page: {},
				startCapture: vi.fn(),
				url: 'https://example.com',
			})).resolves.toBe(false);
		} finally {
			await rm(directory, {force: true, recursive: true});
		}
	});
});
