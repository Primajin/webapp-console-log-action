import {promises as fs} from 'node:fs';
import process from 'node:process';
import {chromium} from 'playwright';
import core from '@actions/core';

// Launches a Chromium browser instance and prepares a new page.
const browser = await chromium.launch();
const page = await browser.newPage();

/**
 * Map to store captured console messages categorized by log levels.
 * @type {Map<string, string[]>}
 */
const consoleMessages = new Map([
	['verbose', []],
	['info', []],
	['warning', []],
	['error', []],
]);

/**
 * Regular expressions to filter log messages based on their content.
 * @type {Object.<string, RegExp>}
 */
const filters = {
	error: new RegExp(process.env.REGEXP_ERROR || '^$'),
	info: new RegExp(process.env.REGEXP_INFO || '^$'),
	verbose: new RegExp(process.env.REGEXP_VERBOSE || '^$'),
	warning: new RegExp(process.env.REGEXP_WARNING || '^$'),
};

/**
 * Array of log levels in order of severity.
 * @type {string[]}
 */
const logLevels = ['verbose', 'info', 'warning', 'error'];

/**
 * Minimum log level to capture.
 * @type {string}
 * @default 'verbose'
 */
const minLogLevel = process.env.MIN_LOG_LEVEL || logLevels[0];

/**
 * Maximum log level to allow before failing the action.
 * @type {string}
 * @default 'info'
 */
const maxLogLevel = process.env.MAX_LOG_LEVEL || logLevels[1];

/**
 * Port to run the web application on.
 * @type {string}
 * @default ''
 */
const port = process.env.PORT || '';

/**
 * Wait time before capturing logs.
 * @type {number}
 * @default 5000
 */
const waitTime = process.env.WAIT_TIME || 5000;

/**
 * URL of the web application.
 * @type {string}
 * @default 'http://localhost'
 */
const webAppUrl = process.env.WEBAPP_URL || 'http://localhost';

/**
 * Filters out parts of the message based on the regular expression.
 * @param {string} level - The log level of the message.
 * @param {string} message - The log message content.
 * @returns {string} - The filtered message.
 */
const filterMessage = (level, message) => message.replace(filters[level], '').trim();

/**
 * Determines if a log message should be captured based on its level.
 * @param {string} level - The log level of the message.
 * @returns {boolean} - True if the message should be captured, false otherwise.
 */
const shouldCapture = level => logLevels.indexOf(level) >= logLevels.indexOf(minLogLevel);

/**
 * Determines if the action should fail based on the log level.
 * @param {string} level - The log level of the message.
 * @returns {boolean} - True if the action should fail, false otherwise.
 */
const shouldFail = level => logLevels.indexOf(level) > logLevels.indexOf(maxLogLevel);

/**
 * Flag to indicate if the action should fail.
 * @type {boolean}
 * @default false
 */
let shouldFailAction = false;

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
	const messageType = message.type();
	const logLevel = logLevelMapping[messageType] || 'info';
	const logMessage = message.text();
	if (shouldCapture(logLevel)) {
		const filteredMessage = filterMessage(logLevel, logMessage);
		if (filteredMessage.length > 0) {
			consoleMessages.get(logLevel).push(filteredMessage);
		}
	}

	if (shouldFail(logLevel)) {
		shouldFailAction = true;
	}
});

await page.goto(port ? `${webAppUrl}:${port}` : webAppUrl);
await page.waitForTimeout(Number.parseInt(waitTime, 10)); // Wait for the specified time

console.log(' ');
console.log('Console messages:', Object.fromEntries(consoleMessages));

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
	core.exportVariable('SHOULD_FAIL_ACTION', 'true');
}

console.log(' ');
