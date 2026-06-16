import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const defaultPreScriptTimeout = 30_000;

export const getPreScriptTimeout = () => {
	const parsedTimeout = Number.parseInt(process.env.PRE_SCRIPT_TIMEOUT || '', 10);
	return Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : defaultPreScriptTimeout;
};

export const resolvePreScriptPath = preScriptPath => {
	const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
	return path.isAbsolute(preScriptPath) ? preScriptPath : path.resolve(workspacePath, preScriptPath);
};

export const loadPreScript = async preScriptPath => {
	const moduleUrl = pathToFileURL(resolvePreScriptPath(preScriptPath)).href;
	const importedModule = await import(moduleUrl);
	if (typeof importedModule.default !== 'function') {
		throw new TypeError(`Pre-script "${preScriptPath}" must export a default async function.`);
	}

	return importedModule.default;
};

export const runPreScript = async ({
	browser,
	context,
	page,
	startCapture: beginCapture,
	url,
}) => {
	const preScriptPath = process.env.PRE_SCRIPT_PATH;
	if (!preScriptPath) {
		return false;
	}

	const preScript = await loadPreScript(preScriptPath);
	const timeout = getPreScriptTimeout();
	let captureStarted = false;
	let timeoutId = null;

	try {
		await Promise.race([
			preScript({
				browser,
				context,
				page,
				async startCapture() {
					beginCapture();
					captureStarted = true;
				},
				url,
			}),
			new Promise((resolve, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(`Pre-script "${preScriptPath}" timed out after ${timeout} ms.`));
				}, timeout);
			}),
		]);
	} catch (error) {
		throw new Error(`Failed to execute pre-script "${preScriptPath}": ${error.message}`, {cause: error});
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}

	return captureStarted;
};
