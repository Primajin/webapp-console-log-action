import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
	afterAll,
	describe,
	expect,
	test,
} from 'vitest';
import {buildCaptureUrl} from './utils.js';

const actionYaml = readFileSync(new URL('action.yml', import.meta.url), 'utf8');

/**
 Returns the `run` script of a composite step, found by its id, exactly as it ships in action.yml.
 @param {string} stepId - The `id:` value of the step in action.yml.
 @returns {string} - The dedented script body.
 */
const getRunScript = stepId => {
	const step = actionYaml.split('\n    - ').find(candidate => candidate.includes(`id: ${stepId}\n`));
	const match = /\n {6}run: \|\n(?<body>(?: {8}.*\n|\n)+)/v.exec(step ?? '');
	if (!match) {
		throw new Error(`Could not find the run script of step "${stepId}" in action.yml.`);
	}

	return match.groups.body.replaceAll(/^ {8}/gmv, '');
};

const setPortScript = getRunScript('set-port');
const workDirectory = mkdtempSync(path.join(tmpdir(), 'set-port-'));
let runCount = 0;

afterAll(() => {
	rmSync(workDirectory, {recursive: true, force: true});
});

/**
 Runs the set-port step with bash and parses the step outputs it writes.
 @param {string} webappUrl - The webapp-url input.
 @param {string} [port] - The port input.
 @returns {{status: number, stdout: string, outputs: {[key: string]: string}}} - Exit status, stdout and step outputs.
 */
const runSetPort = (webappUrl, port = '') => {
	runCount++;
	const outputFile = path.join(workDirectory, `github_output_${runCount}`);
	const result = spawnSync('bash', ['-c', setPortScript], {
		encoding: 'utf8',
		env: {
			PATH: process.env.PATH,
			GITHUB_OUTPUT: outputFile,
			INPUT_PORT: port,
			WEBAPP_URL: webappUrl,
		},
	});
	let content = '';
	try {
		content = readFileSync(outputFile, 'utf8');
	} catch {}

	const outputs = Object.fromEntries(content.split('\n').filter(Boolean).map(line => {
		const separator = line.indexOf('=');
		return [line.slice(0, separator), line.slice(separator + 1)];
	}));
	return {status: result.status, stdout: result.stdout, outputs};
};

describe('action.yml set-port step', () => {
	test.each([
		'http://localhost',
		'http://localhost/',
		'http://localhost:8080',
		'http://localhost:8080/path?query=1#hash',
		'http://localhost/nonexistent-page.html',
		'http://127.0.0.1',
		'http://127.0.0.1:4000/index.html',
		'http://[::1]',
		'http://[::1]:4000/path',
		'HTTP://LOCALHOST',
		'Http://LocalHost:8080/Path',
		'http://LOCALHOST',
	])('treats %s as local', webappUrl => {
		const {status, outputs} = runSetPort(webappUrl);
		expect(status).toBe(0);
		expect(outputs['is-local']).toBe('true');
	});

	test.each([
		'https://localhost',
		'https://localhost:3000',
		'HTTPS://LOCALHOST',
		'https://127.0.0.1',
		'https://localhost.example.com',
		'https://127.0.0.1.example.com',
		'https://localhost@example.com',
		'https://localhost:8080@example.com',
		'https://example.com/?next=http://localhost',
		'https://example.com/http://localhost',
		'http://localhostile',
		'http://127.0.0.10',
		'localhost',
		'localhost:3000',
		'https://primajin.github.io/webapp-console-log-action/login-demo/login',
		'',
	])('does not treat %s as local', webappUrl => {
		const {status, outputs} = runSetPort(webappUrl);
		expect(status).toBe(0);
		expect(outputs['is-local']).toBe('false');
		expect(outputs.port).toBe('');
	});

	test('defaults the port to 3000 for a local url without a port input', () => {
		expect(runSetPort('http://localhost').outputs.port).toBe('3000');
		expect(runSetPort('HTTP://LOCALHOST').outputs.port).toBe('3000');
		expect(runSetPort('http://127.0.0.1').outputs.port).toBe('3000');
		expect(runSetPort('http://[::1]').outputs.port).toBe('3000');
		expect(runSetPort('http://localhost:8080/path').outputs.port).toBe('3000');
	});

	test('keeps the port input for local and external urls', () => {
		expect(runSetPort('http://localhost', '3001').outputs.port).toBe('3001');
		expect(runSetPort('HTTP://LOCALHOST', '3001').outputs.port).toBe('3001');
		expect(runSetPort('https://example.com', '8443').outputs.port).toBe('8443');
	});

	test('binds the dual-stack address only for the IPv6 loopback', () => {
		expect(runSetPort('http://[::1]:4000').outputs['bind-address']).toBe('::');
		expect(runSetPort('HTTP://[::1]').outputs['bind-address']).toBe('::');
		expect(runSetPort('http://localhost').outputs['bind-address']).toBe('');
		expect(runSetPort('http://127.0.0.1').outputs['bind-address']).toBe('');
		expect(runSetPort('https://example.com').outputs['bind-address']).toBe('');
	});

	test.each(['abc', '0', '65536', '3000;id', '-1', '3000 '])('rejects the invalid port "%s"', port => {
		const {status, stdout, outputs} = runSetPort('http://localhost', port);
		expect(status).toBe(1);
		expect(stdout).toContain('Error: port must be a whole number from 1 to 65535');
		expect(outputs).toEqual({});
	});

	test('rejects an invalid port for an external url as well', () => {
		expect(runSetPort('https://example.com', 'abc').status).toBe(1);
	});

	test('hands the capture script a url the page can open for every local form', () => {
		for (const webappUrl of ['HTTP://LOCALHOST', 'http://127.0.0.1', 'http://[::1]', 'http://localhost:8080/path']) {
			const {outputs} = runSetPort(webappUrl);
			const captureUrl = new URL(buildCaptureUrl(webappUrl, outputs.port));
			expect(captureUrl.port).toBe('3000');
			expect(captureUrl.protocol).toBe('http:');
		}
	});
});

describe('action.yml local steps', () => {
	test('uses the is-local output of the set-port step, not its own url check', () => {
		expect(actionYaml).not.toContain('contains(inputs.webapp-url');
		expect(actionYaml).not.toMatch(/\*"http:\/\/localhost"\*/v);
		for (const stepName of ['Check artifact name requirement', 'Download artifact', 'Run http-server in the background']) {
			const step = actionYaml.split('\n    - ').find(candidate => candidate.startsWith(`name: ${stepName}\n`));
			expect(step, stepName).toContain('if: steps.set-port.outputs.is-local == \'true\'');
		}
	});
});
