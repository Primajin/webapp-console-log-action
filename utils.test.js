import {
	afterEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

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
			vi.stubEnv('REGEXP_VERBOSE', 'verbose ');
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('verbose', 'This is a verbose message')).toBe('This is a message');
		});

		test('info', async () => {
			vi.stubEnv('REGEXP_INFO', 'info ');
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('info', 'This is a info message')).toBe('This is a message');
		});

		test('warning', async () => {
			vi.stubEnv('REGEXP_WARNING', 'warning ');
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('warning', 'This is a warning message')).toBe('This is a message');
		});

		test('error', async () => {
			vi.stubEnv('REGEXP_ERROR', 'error ');
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('error', 'This is a error message')).toBe('This is a message');
		});
	});

	describe('use regexp', () => {
		test('verbose', async () => {
			vi.stubEnv('REGEXP_VERBOSE', String.raw`is\D+sa`);
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('verbose', 'This is a verbose message')).toBe('Thge');
		});

		test('info', async () => {
			vi.stubEnv('REGEXP_INFO', String.raw`is\D+sa`);
			const {filterMessage} = await import('./utils.js');
			expect(filterMessage('info', 'This is a info message')).toBe('Thge');
		});

		test('warning', async () => {
			vi.stubEnv('REGEXP_WARNING', String.raw`\[.+(?:Automatic fallback to software WebGL has been deprecated|GPU stall due to ReadPixels).*`);
			const {filterMessage} = await import('./utils.js');
			const warningMessages = [
				'[GroupMarkerNotSet(crbug.com/242999)!:A0301C00AC2E0000]Automatic fallback to software WebGL has been deprecated. Please use the --enable-unsafe-swiftshader flag to opt in to lower security guarantees for trusted content.',
				'[.WebGL-0x17fc000e5500]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc123ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
				'[.WebGL-0x20bc000ce300]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (this message will no longer repeat)',
			];
			for (const message of warningMessages) {
				expect(filterMessage('warning', message)).toBe('');
			}
		});

		test('error', async () => {
			vi.stubEnv('REGEXP_ERROR', String.raw`Failed \D+ 404 \(\)`);
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

describe('validateStatusCode', () => {
	describe('default behavior (validation enabled, positive=[200])', () => {
		test('should pass for 200', async () => {
			const {validateStatusCode} = await import('./utils.js');
			expect(validateStatusCode(200)).toEqual({ok: true, reason: ''});
		});

		test('should fail for 404', async () => {
			const {validateStatusCode} = await import('./utils.js');
			const result = validateStatusCode(404);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('404');
			expect(result.reason).toContain('200');
		});

		test('should fail for 500', async () => {
			const {validateStatusCode} = await import('./utils.js');
			const result = validateStatusCode(500);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('500');
		});
	});

	describe('validation disabled', () => {
		test('should pass any status code when VALIDATE_STATUS=false', async () => {
			vi.stubEnv('VALIDATE_STATUS', 'false');
			const {validateStatusCode} = await import('./utils.js');
			expect(validateStatusCode(404)).toEqual({ok: true, reason: ''});
			expect(validateStatusCode(500)).toEqual({ok: true, reason: ''});
			expect(validateStatusCode(200)).toEqual({ok: true, reason: ''});
		});
	});

	describe('custom positive statuses', () => {
		test('should pass for 404 when configured as positive', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '404');
			const {validateStatusCode} = await import('./utils.js');
			expect(validateStatusCode(404)).toEqual({ok: true, reason: ''});
		});

		test('should fail for 200 when only 404 is positive', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '404');
			const {validateStatusCode} = await import('./utils.js');
			const result = validateStatusCode(200);
			expect(result.ok).toBe(false);
			expect(result.reason).toContain('200');
			expect(result.reason).toContain('404');
		});

		test('should pass for any code in a multi-code positive list', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200,201,404');
			const {validateStatusCode} = await import('./utils.js');
			expect(validateStatusCode(200)).toEqual({ok: true, reason: ''});
			expect(validateStatusCode(201)).toEqual({ok: true, reason: ''});
			expect(validateStatusCode(404)).toEqual({ok: true, reason: ''});
		});
	});

	describe('custom negative statuses', () => {
		test('should fail with negative-specific reason when code is in negative set', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200');
			vi.stubEnv('NEGATIVE_STATUSES', '404,500');
			const {validateStatusCode} = await import('./utils.js');
			const result404 = validateStatusCode(404);
			expect(result404.ok).toBe(false);
			expect(result404.reason).toContain('404');
			expect(result404.reason).toContain('negative');
		});

		test('positive codes take precedence over negative codes', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200,404');
			vi.stubEnv('NEGATIVE_STATUSES', '404,500');
			const {validateStatusCode} = await import('./utils.js');
			expect(validateStatusCode(404)).toEqual({ok: true, reason: ''});
		});

		test('unlisted codes still fail even without explicit negative set', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200');
			const {validateStatusCode} = await import('./utils.js');
			const result = validateStatusCode(302);
			expect(result.ok).toBe(false);
		});
	});

	describe('getPositiveStatusCodes and getNegativeStatusCodes defaults', () => {
		test('getPositiveStatusCodes defaults to [200]', async () => {
			const {getPositiveStatusCodes} = await import('./utils.js');
			expect(getPositiveStatusCodes()).toEqual([200]);
		});

		test('getNegativeStatusCodes defaults to []', async () => {
			const {getNegativeStatusCodes} = await import('./utils.js');
			expect(getNegativeStatusCodes()).toEqual([]);
		});

		test('getPositiveStatusCodes parses env var', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200,201,301');
			const {getPositiveStatusCodes} = await import('./utils.js');
			expect(getPositiveStatusCodes()).toEqual([200, 201, 301]);
		});

		test('getNegativeStatusCodes parses env var', async () => {
			vi.stubEnv('NEGATIVE_STATUSES', '404,500');
			const {getNegativeStatusCodes} = await import('./utils.js');
			expect(getNegativeStatusCodes()).toEqual([404, 500]);
		});

		test('invalid codes are filtered out', async () => {
			vi.stubEnv('POSITIVE_STATUSES', '200,abc,999,201');
			const {getPositiveStatusCodes} = await import('./utils.js');
			expect(getPositiveStatusCodes()).toEqual([200, 201]);
		});
	});
});
