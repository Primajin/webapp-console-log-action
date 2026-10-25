import {spawnSync} from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
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

describe('action.yml pre-script guard step', () => {
	const checkPreScriptScript = getRunScript('check-pre-script');
	const workspace = path.join(workDirectory, 'workspace');
	mkdirSync(path.join(workspace, '.github', 'scripts'), {recursive: true});
	mkdirSync(path.join(workspace, 'a directory'));
	writeFileSync(path.join(workspace, '.github', 'scripts', 'login.js'), 'export default () => {};\n');
	writeFileSync(path.join(workspace, 'with spaces.js'), '');
	writeFileSync(path.join(workspace, 'semi;colon.js'), '');

	/**
	 Runs the guard step with bash in the fake workspace.
	 @param {string} preScriptPath - The pre-script-path input.
	 @returns {{status: number, stdout: string}} - Exit status and stdout.
	 */
	const runGuard = preScriptPath => {
		const result = spawnSync('bash', ['-c', checkPreScriptScript], {
			encoding: 'utf8',
			cwd: workDirectory,
			env: {
				PATH: process.env.PATH,
				GITHUB_WORKSPACE: workspace,
				PRE_SCRIPT_PATH: preScriptPath,
			},
		});
		return {status: result.status, stdout: result.stdout};
	};

	test('does nothing without a pre-script path, whether or not a checkout happened', () => {
		expect(runGuard('')).toEqual({status: 0, stdout: ''});
	});

	test('accepts a relative path to an existing file in the workspace', () => {
		expect(runGuard('.github/scripts/login.js')).toEqual({status: 0, stdout: ''});
		expect(runGuard('./with spaces.js').status).toBe(0);
	});

	test('accepts an absolute path to an existing file', () => {
		expect(runGuard(path.join(workspace, '.github', 'scripts', 'login.js')).status).toBe(0);
		// An absolute path is not looked up in the workspace, so it works outside of it too
		const outside = path.join(workDirectory, 'outside.js');
		writeFileSync(outside, '');
		expect(runGuard(outside).status).toBe(0);
	});

	test('accepts a path with spaces', () => {
		expect(runGuard('with spaces.js').status).toBe(0);
		expect(runGuard(path.join(workspace, 'with spaces.js')).status).toBe(0);
	});

	test.each([
		'.github/scripts/missing.js',
		'missing.js',
		'../workspace/../nope.js',
	])('fails with a pointer to actions/checkout when the relative path "%s" does not exist', preScriptPath => {
		const {status, stdout} = runGuard(preScriptPath);
		expect(status).toBe(1);
		expect(stdout).toMatch(/^::error::pre-script-path /v);
		expect(stdout).toContain('add an actions/checkout step before it, or fix the path');
		expect(stdout).toContain(`looked for ${workspace}/${preScriptPath}`);
		expect(stdout.trimEnd().split('\n')).toHaveLength(1);
	});

	test('fails when an absolute path does not exist', () => {
		const missing = path.join(workspace, 'not-checked-out.js');
		const {status, stdout} = runGuard(missing);
		expect(status).toBe(1);
		expect(stdout).toContain(`looked for ${missing}`);
		expect(stdout).toContain('actions/checkout');
	});

	test('fails when the path is a directory and not a file', () => {
		for (const directory of ['a directory', '.github', path.join(workspace, 'a directory')]) {
			const {status, stdout} = runGuard(directory);
			expect(status, directory).toBe(1);
			expect(stdout, directory).toContain('does not point to an existing file');
		}
	});

	test('names a path with spaces in a way that is still readable', () => {
		const {stdout} = runGuard('no such file.js');
		expect(stdout).toContain(String.raw`no\ such\ file.js`);
	});

	test.each([
		'$(touch injected)',
		'`touch injected`',
		'x; touch injected',
		'x" && touch injected && "',
		'$(touch injected).js',
		'x\ntouch injected',
		// eslint-disable-next-line no-template-curly-in-string -- a literal shell expansion, not a template
		'${IFS}touch${IFS}injected',
	])('never executes a path with shell metacharacters: %j', preScriptPath => {
		for (const candidate of [preScriptPath, path.join(workspace, preScriptPath)]) {
			const {status, stdout} = runGuard(candidate);
			expect(status).toBe(1);
			expect(stdout).toContain('::error::pre-script-path');
			// Quoted onto a single line: a newline in the path must not start a second workflow command
			expect(stdout.trimEnd().split('\n')).toHaveLength(1);
		}

		expect(existsSync(path.join(workspace, 'injected'))).toBe(false);
		expect(existsSync(path.join(workDirectory, 'injected'))).toBe(false);
	});

	test('accepts an existing file whose name contains shell metacharacters without running anything', () => {
		expect(runGuard('semi;colon.js').status).toBe(0);
		expect(existsSync(path.join(workspace, 'colon.js'))).toBe(false);
	});

	test('runs before the steps that need Node and does not check out the repository', () => {
		const stepNames = actionYaml.matchAll(/^ {4}- name: (?<name>.+?)(?: {2}#.*)?$/gmv).map(match => match.groups.name).toArray();
		expect(stepNames.indexOf('Check that the pre-script exists')).toBeGreaterThan(stepNames.indexOf('Decide whether webapp-url is local and set the port'));
		expect(stepNames.indexOf('Check that the pre-script exists')).toBeLessThan(stepNames.indexOf('Setup Playwright'));
		expect(actionYaml).not.toContain('actions/checkout@');
	});

	test('hands the path to the step through env only', () => {
		const step = actionYaml.split('\n    - ').find(candidate => candidate.includes('id: check-pre-script\n'));
		/* eslint-disable no-template-curly-in-string -- the literal GitHub expression syntax is what is asserted */
		expect(step).toContain('PRE_SCRIPT_PATH: ${{ inputs.pre-script-path }}');
		expect(checkPreScriptScript).not.toContain('${{');
		/* eslint-enable no-template-curly-in-string */
	});
});
