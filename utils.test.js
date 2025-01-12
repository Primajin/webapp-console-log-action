import {
	afterEach, describe, expect, test, vi,
} from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

/**
 * Encodes a string to base64.
 * @param {string} str - The string to encode.
 * @returns {string} - The base64 encoded string.
 */
const encodeBase64 = string_ => Buffer.from(string_).toString('base64');

describe('filterMessage', () => {
	describe('default', () => {
		test('verbose', async () => {
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('verbose', 'This is a verbose message')).toBe('This is a verbose message');
		});

		test('info', async () => {
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('info', 'This is a info message')).toBe('This is a info message');
		});

		test('warning', async () => {
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('warning', 'This is a warning message')).toBe('This is a warning message');
		});

		test('error', async () => {
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('error', 'This is a error message')).toBe('This is a error message');
		});
	});

	describe('remove words', () => {
		test('verbose', async () => {
			vi.stubEnv('REGEXP_VERBOSE', encodeBase64('verbose '));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('verbose', 'This is a verbose message')).toBe('This is a message');
		});

		test('info', async () => {
			vi.stubEnv('REGEXP_INFO', encodeBase64('info '));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('info', 'This is a info message')).toBe('This is a message');
		});

		test('warning', async () => {
			vi.stubEnv('REGEXP_WARNING', encodeBase64('warning '));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('warning', 'This is a warning message')).toBe('This is a message');
		});

		test('error', async () => {
			vi.stubEnv('REGEXP_ERROR', encodeBase64('error '));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('error', 'This is a error message')).toBe('This is a message');
		});
	});

	describe('use regexp', () => {
		test('verbose', async () => {
			vi.stubEnv('REGEXP_VERBOSE', encodeBase64('is\\D+sa'));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('verbose', 'This is a verbose message')).toBe('Thge');
		});

		test('info', async () => {
			vi.stubEnv('REGEXP_INFO', encodeBase64('is\\D+sa'));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('info', 'This is a info message')).toBe('Thge');
		});

		test('warning', async () => {
			vi.stubEnv('REGEXP_WARNING', encodeBase64('\\[GroupMarkerNotSet\\(crbug\\.com\\/242999.+|\\[\\.WebGL-\\d+x[0-9a-f]+\\]GL Driver Message \\(OpenGL, Performance, GL_CLOSE_PATH_NV, High\\): GPU stall due to ReadPixels( \\(this message will no longer repeat\\))?'));
			const {filterMessage} = await import('./utils.js');
			const warningMessages = [
				'[GroupMarkerNotSet(crbug.com/242999)!:A0301C00AC2E0000]Automatic fallback to software WebGL has been deprecated. Please use the --enable-unsafe-swiftshader flag to opt in to lower security guarantees for trusted content.',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (this message will no longer repeat)',
			];
			for (const message of warningMessages) {
				expect(filterMessage('warning', message)).toBe('');
			}
		});

		test('error', async () => {
			vi.stubEnv('REGEXP_ERROR', encodeBase64('Failed \\D+ 404 \\(\\)'));
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('error', 'Failed to load resource: the server responded with a status of 404 ()')).toBe('');
		});
	});
});

describe('shouldCapture', () => {
	test('should capture by default - verbose', async () => {
		const {shouldCapture} = await import('./utils.js');
		expect(shouldCapture('verbose')).toBe(true);
	});

	test('should capture by default - info', async () => {
		const {shouldCapture} = await import('./utils.js');
		expect(shouldCapture('info')).toBe(true);
	});

	test('should capture by default - warning', async () => {
		const {shouldCapture} = await import('./utils.js');
		expect(shouldCapture('warning')).toBe(true);
	});

	test('should capture by default - error', async () => {
		const {shouldCapture} = await import('./utils.js');
		expect(shouldCapture('error')).toBe(true);
	});
});

describe('shouldFail', () => {
	test('should not fail by default - verbose', async () => {
		const {shouldFail} = await import('./utils.js');
		expect(shouldFail('verbose')).toBe(false);
	});

	test('should not fail by default - info', async () => {
		const {shouldFail} = await import('./utils.js');
		expect(shouldFail('info')).toBe(false);
	});

	test('should fail by default - warning', async () => {
		const {shouldFail} = await import('./utils.js');
		expect(shouldFail('warning')).toBe(true);
	});

	test('should fail by default - error', async () => {
		const {shouldFail} = await import('./utils.js');
		expect(shouldFail('error')).toBe(true);
	});
});
