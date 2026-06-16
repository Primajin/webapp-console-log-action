import {promises as fs} from 'node:fs';
import process from 'node:process';
import {chromium} from 'playwright';
import {exportVariable} from '@actions/core';
import {runPreScript} from './pre-script.js';
import {
	filterMessage, shouldCapture, shouldFail, logLevels,
} from './utils.js';

// Launches a Chromium browser instance and prepares a new page.
const browser = await chromium.launch();
const page = await browser.newPage();
const context = page.context();

/**
 * Map to store captured console messages categorized by log levels.
 * @type {Map<string, string[]>}
 */
const consoleMessages = new Map([
	[logLevels[0], []],
	[logLevels[1], []],
	[logLevels[2], []],
	[logLevels[3], []],
]);

/**
 * Port to run the web application on.
 * @type {string}
 * @default ''
 */
const port = process.env.PORT || '';

/**
 * Wait time before capturing logs.
 * @type {string}
 * @default '5000'
 */
const waitTime = process.env.WAIT_TIME || '5000';

/**
 * URL of the web application.
 * @type {string}
 * @default 'http://localhost'
 */
const webAppUrl = process.env.WEBAPP_URL || 'http://localhost';
const captureUrl = port ? `${webAppUrl}:${port}` : webAppUrl;

/**
 * Flag to indicate if the action should fail.
 * @type {boolean}
 * @default false
 */
let shouldFailAction = false;
let shouldCaptureMessages = !process.env.PRE_SCRIPT_PATH;

/**
 * Mapping of console message types to log levels.
 * @type {Object.<string, string>}
 */
const logLevelMapping = {
	log: 'info',
	debug: 'verbose',
	info: 'info',
	error: 'error',
	warning: 'warning',
	dir: 'info',
	dirxml: 'info',
	table: 'info',
	trace: 'verbose',
	clear: 'verbose',
	startGroup: 'verbose',
	startGroupCollapsed: 'verbose',
	endGroup: 'verbose',
	assert: 'error',
	profile: 'verbose',
	profileEnd: 'verbose',
	count: 'verbose',
	timeEnd: 'verbose',
};

/**
 * Event listener for console messages from the page.
 * @param {ConsoleMessage} message - The console message object.
 */
page.on('console', message => {
	if (!shouldCaptureMessages) {
		return;
	}

	const messageType = message.type();
	const logLevel = logLevelMapping[messageType] || 'info';
	const logMessage = message.text();
	if (shouldCapture(logLevel)) {
		const filteredMessage = filterMessage(logLevel, logMessage);
		if (filteredMessage.length > 0) {
			consoleMessages.get(logLevel).push(filteredMessage);
			if (shouldFail(logLevel)) {
				shouldFailAction = true;
			}
		}
	}
});

const startCapture = () => {
	shouldCaptureMessages = true;
};

await page.goto(captureUrl);

if (process.env.PRE_SCRIPT_PATH) {
	const captureStartedByPreScript = await runPreScript({
		browser,
		context,
		page,
		startCapture,
		url: captureUrl,
	});
	if (!captureStartedByPreScript) {
		startCapture();
	}
}

await page.waitForTimeout(Number.parseInt(waitTime, 10)); // Wait for the specified time

console.log(' ');
console.log('Captured messages:', Object.fromEntries(consoleMessages));

// Remove keys with empty arrays
for (const [key, value] of consoleMessages) {
	if (value.length === 0) {
		consoleMessages.delete(key);
	}
}

await fs.writeFile('console_output.json', JSON.stringify(Object.fromEntries(consoleMessages), null, 2));

await browser.close();

if (shouldFailAction) {
	console.log(' ');
	console.warn('Action should fail due to log level threshold, but will not exit here.');
	exportVariable('SHOULD_FAIL_ACTION', 'true');
}

console.log(' ');
