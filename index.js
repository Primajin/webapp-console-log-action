import {promises as fs} from 'node:fs';
import process from 'node:process';
import {chromium} from 'playwright';
import {exportVariable, warning} from '@actions/core';
import {resolveContextOptions} from './context-options.js';
import {annotateProblems, createProblemCollector} from './page-problems.js';
import {runPreScript} from './pre-script.js';
import {
	buildSelectorWaitOptions,
	describeWaitUntil,
	mapWaitUntil,
	waitForConfiguredSelector,
} from './wait.js';
import {
	buildCaptureUrl,
	filterMessage,
	shouldCapture,
	shouldFail,
	validateStatusCode,
	logLevels,
} from './utils.js';

// Playwright browser context options of the context-options input; an invalid value fails the run here, before a browser is started
const contextOptions = resolveContextOptions(process.env.CONTEXT_OPTIONS);

// Launches a Chromium browser instance and prepares a new page.
const browser = await chromium.launch();
const page = await browser.newPage(contextOptions);
const context = page.context();

/**
 Map to store captured console messages categorized by log levels.
 @type {Map<string, string[]>}
 */
const consoleMessages = new Map([
	[logLevels[0], []],
	[logLevels[1], []],
	[logLevels[2], []],
	[logLevels[3], []],
]);

/**
 Port to run the web application on.
 @type {string}
 @default ''
 */
const port = process.env.PORT || '';

/**
 Wait time before capturing logs.
 @type {string}
 @default '5000'
 */
const waitTime = process.env.WAIT_TIME || '5000';

// When the navigation counts as done; the default, "load", is what page.goto waits for without an option
const waitUntilInput = process.env.WAIT_UNTIL;
const waitUntilResult = mapWaitUntil(waitUntilInput);
const {warning: waitUntilWarning, notice: waitUntilNotice} = describeWaitUntil(waitUntilInput, waitUntilResult);
if (waitUntilWarning) {
	console.warn(waitUntilWarning);
}

if (waitUntilNotice) {
	console.log(waitUntilNotice);
}

/**
 Selector to wait for before the capture ends, and how (empty: do not wait).
 */
const waitForSelector = process.env.WAIT_FOR_SELECTOR || '';
const waitForSelectorOptions = buildSelectorWaitOptions({
	visible: (process.env.WAIT_FOR_SELECTOR_VISIBLE || '').toLowerCase() === 'true',
	hidden: (process.env.WAIT_FOR_SELECTOR_HIDDEN || '').toLowerCase() === 'true',
	timeout: process.env.WAIT_FOR_SELECTOR_TIMEOUT,
});

/**
 Whether to report what the page does wrong (uncaught exceptions, console errors from before the capture started, a selector never reached).
 @type {boolean}
 @default false
 */
const isReportingPageProblems = (process.env.REPORT_PAGE_PROBLEMS || '').toLowerCase() === 'true';
const pageProblems = createProblemCollector();

/**
 URL of the web application.
 @type {string}
 @default 'http://localhost'
 */
const webAppUrl = process.env.WEBAPP_URL || 'http://localhost';
const captureUrl = buildCaptureUrl(webAppUrl, port);

/**
 Flag to indicate if the action should fail.
 @type {boolean}
 @default false
 */
let shouldFailAction = false;
let shouldCaptureMessages = !process.env.PRE_SCRIPT_PATH;
let totalMessagesObserved = 0;

/**
 Mapping of console message types to log levels.
 @type {{[key: string]: string}}
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
 Event listener for console messages from the page.
 @param {ConsoleMessage} message - The console message object.
 */
page.on('console', message => {
	if (!shouldCaptureMessages) {
		return;
	}

	totalMessagesObserved++;

	const messageType = message.type();
	const logLevel = logLevelMapping[messageType] || 'info';
	if (!shouldCapture(logLevel)) {
		return;
	}

	const logMessage = message.text();
	const filteredMessage = filterMessage(logLevel, logMessage);
	if (filteredMessage.length === 0) {
		return;
	}

	consoleMessages.get(logLevel).push(filteredMessage);
	if (shouldFail(logLevel)) {
		shouldFailAction = true;
	}
});

// Right after the page was created, before it navigates: the errors of loading are the ones most worth reporting.
// A console error the log capture records is in the comment already, so only the ones before it started count.
if (isReportingPageProblems) {
	pageProblems.attach(page, () => !shouldCaptureMessages);
}

const startCapture = () => {
	shouldCaptureMessages = true;
};

/**
 Write the problems the page reported for the comment step and show them as annotations of the run.
 Written (empty) without report-page-problems too, so that the comment step always finds the file.
 */
const writePageProblems = async () => {
	const problems = pageProblems.list();
	annotateProblems(problems, warning, console.warn);
	await fs.writeFile('page_problems.json', JSON.stringify(problems, null, 2));
};

/**
 Ends the run early: the later action steps still need their input files, so write them empty,
 close the browser and export why the action has to fail (the markdown output shows the reason).
 @param {string} reason - Why the action fails, as shown in the comment (without any emoji).
 */
const failEarly = async reason => {
	await fs.writeFile('console_output.json', JSON.stringify({}, null, 2));
	await fs.writeFile('capture_stats.json', JSON.stringify({totalObserved: 0}, null, 2));
	await writePageProblems();
	await browser.close();
	exportVariable('SHOULD_FAIL_ACTION', 'true');
	exportVariable('SHOULD_FAIL_REASON', reason);
};

const response = await page.goto(captureUrl, {waitUntil: waitUntilResult.value});
const statusCode = response ? response.status() : 0;
const {ok: statusOk, reason: statusReason} = validateStatusCode(statusCode);

let preScriptError;
if (statusOk && process.env.PRE_SCRIPT_PATH) {
	try {
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
	} catch (error) {
		// A failing pre-script (load error, throw, timeout) must not crash this script: the later steps still need their files
		preScriptError = error;
	}
}

if (preScriptError) {
	// The full error (with the "Failed to execute pre-script" prefix and stack) goes to the log, the comment gets the cause without the prefix
	console.error(preScriptError);
	await failEarly(`Pre-script failed: ${preScriptError.cause?.message ?? preScriptError.message}`);
} else if (statusOk) {
	// After the pre-script, so a selector of the page it leads to can be waited for. The logs of the wait are captured.
	const isSelectorTimedOut = await waitForConfiguredSelector(page, waitForSelector, waitForSelectorOptions);
	if (isSelectorTimedOut && isReportingPageProblems) {
		pageProblems.add(`never reached ${waitForSelector}`);
	}

	await page.waitForTimeout(Number(waitTime)); // Wait for the specified time

	console.log(' ');
	console.log('Captured messages:', Object.fromEntries(consoleMessages));

	// Remove keys with empty arrays
	for (const [key, value] of consoleMessages) {
		if (value.length === 0) {
			consoleMessages.delete(key);
		}
	}

	await fs.writeFile('console_output.json', JSON.stringify(Object.fromEntries(consoleMessages), null, 2));
	await fs.writeFile('capture_stats.json', JSON.stringify({totalObserved: totalMessagesObserved}, null, 2));
	await writePageProblems();

	await browser.close();

	if (shouldFailAction) {
		console.log(' ');
		console.warn('Action should fail due to log level threshold, but will not exit here.');
		exportVariable('SHOULD_FAIL_ACTION', 'true');
	}

	console.log(' ');
} else {
	console.error(`HTTP status validation failed: ${statusReason}`);
	await failEarly(statusReason);
}
