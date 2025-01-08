import {promises as fs} from 'node:fs';
import process from 'node:process';
import {chromium} from 'playwright';
import core from '@actions/core';

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleMessages = {
	verbose: [],
	info: [],
	warning: [],
	error: [],
};

const logLevels = ['verbose', 'info', 'warning', 'error'];
const minLogLevel = process.env.MIN_LOG_LEVEL || 'verbose';
const maxLogLevel = process.env.MAX_LOG_LEVEL || 'info';

const shouldCapture = level => logLevels.indexOf(level) >= logLevels.indexOf(minLogLevel);
const shouldFail = level => logLevels.indexOf(level) > logLevels.indexOf(maxLogLevel);

let shouldFailAction = false;

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

page.on('console', message => {
	const messageType = message.type();
	const logLevel = logLevelMapping[messageType] || 'info';
	if (shouldCapture(logLevel)) {
		consoleMessages[logLevel].push(message.text());
	}

	if (shouldFail(logLevel)) {
		shouldFailAction = true;
	}
});

const webAppUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
const waitTime = process.env.WAIT_TIME || 5000;

await page.goto(webAppUrl);
await page.waitForTimeout(Number.parseInt(waitTime, 10)); // Wait for the specified time

console.log(' ');
console.log('Console messages:', consoleMessages);

// Remove keys with empty arrays
for (const key in consoleMessages) {
	if (consoleMessages[key].length === 0) {
		delete consoleMessages[key];
	}
}

await fs.writeFile('console_output.json', JSON.stringify(consoleMessages, null, 2));

await browser.close();

if (shouldFailAction) {
	console.log(' ');
	console.warn('Action should fail due to log level threshold, but will not exit here.');
	core.exportVariable('SHOULD_FAIL_ACTION', 'true');
}

console.log(' ');

