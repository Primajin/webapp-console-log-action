// Kept identical in Primajin/screenshots-ci-action and Primajin/webapp-console-log-action: change both copies together.
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const DEFAULT_PRE_SCRIPT_TIMEOUT = 30_000;

const getPreScriptTimeout = () => {
	const parsedTimeout = Number(process.env.PRE_SCRIPT_TIMEOUT || '');
	return Number.isFinite(parsedTimeout) && parsedTimeout > 0
		? parsedTimeout
		: DEFAULT_PRE_SCRIPT_TIMEOUT;
};

const resolvePreScriptPath = preScriptPath => {
	const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
	return path.isAbsolute(preScriptPath)
		? preScriptPath
		: path.resolve(workspacePath, preScriptPath);
};

const loadPreScript = async preScriptPath => {
	const moduleUrl = pathToFileURL(resolvePreScriptPath(preScriptPath)).href;
	const importedModule = await import(moduleUrl);
	if (typeof importedModule.default !== 'function') {
		throw new TypeError(
			`Pre-script "${preScriptPath}" must export a default async function.`,
		);
	}

	return importedModule.default;
};

// Runs the user's pre-script (if PRE_SCRIPT_PATH is set). Returns true when the
// script called startCapture(). Errors never include the environment, so
// secrets handed to the script via env are not logged by this module.
const runPreScript = async ({
	browser,
	context,
	page,
	startCapture: beginCapture = () => {},
	url,
}) => {
	const preScriptPath = process.env.PRE_SCRIPT_PATH;
	if (!preScriptPath) {
		return false;
	}

	const timeout = getPreScriptTimeout();
	let isCaptureStarted = false;
	let timeoutId = null;

	try {
		// Loading is inside the try so missing files and syntax errors get the
		// same "Failed to execute pre-script" prefix as runtime failures.
		const preScript = await loadPreScript(preScriptPath);
		await Promise.race([
			preScript({
				browser,
				context,
				page,
				async startCapture() {
					beginCapture();
					isCaptureStarted = true;
				},
				url,
			}),
			new Promise((resolve, reject) => {
				timeoutId = setTimeout(() => {
					reject(
						new Error(
							`Pre-script "${preScriptPath}" timed out after ${timeout} ms.`,
						),
					);
				}, timeout);
			}),
		]);
	} catch (error) {
		throw new Error(
			`Failed to execute pre-script "${preScriptPath}": ${error.message}`,
			{cause: error},
		);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}

	return isCaptureStarted;
};

export {
	getPreScriptTimeout,
	loadPreScript,
	resolvePreScriptPath,
	runPreScript,
};
