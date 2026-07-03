import process from 'node:process';

/**
 Array of log levels in order of severity.
 @type {string[]}
 */
export const logLevels = ['verbose', 'info', 'warning', 'error'];

/**
 Whether HTTP status validation is enabled.
 @type {boolean}
 @default true
 */
export const isStatusValidationEnabled = () => process.env.VALIDATE_STATUS !== 'false';

/**
 Parses a comma-separated list of HTTP status codes from an environment variable.
 @param {string} envVar - The environment variable value.
 @returns {number[]} - Array of parsed status codes.
 */
const parseStatusCodes = envVar => {
	if (!envVar) {
		return [];
	}

	return envVar.split(',').map(s => Number(s.trim())).filter(n => Number.isSafeInteger(n) && n >= 100 && n <= 599);
};

/**
 The set of HTTP status codes considered positive (successful).
 Falls back to [200] if not configured.
 @type {number[]}
 */
export const getPositiveStatusCodes = () => {
	const codes = parseStatusCodes(process.env.POSITIVE_STATUSES);
	return codes.length > 0 ? codes : [200];
};

/**
 The set of HTTP status codes that should cause the action to fail.
 Falls back to empty array if not configured (any code not in positive set will fail).
 @type {number[]}
 */
export const getNegativeStatusCodes = () => parseStatusCodes(process.env.NEGATIVE_STATUSES);

/**
 Determines whether the given HTTP status code is acceptable.
 Positive codes take precedence: if the code is in the positive set, it passes.
 If validation is disabled, all codes pass.
 If the code is in the negative set, it fails.
 If the code is not in either set, it fails (unlisted codes are treated as failures).
 @param {number} statusCode - The HTTP response status code.
 @returns {{ok: boolean, reason: string}} - Result object with ok flag and reason string.
 */
export const validateStatusCode = statusCode => {
	if (!isStatusValidationEnabled()) {
		return {ok: true, reason: ''};
	}

	const positives = getPositiveStatusCodes();
	if (positives.includes(statusCode)) {
		return {ok: true, reason: ''};
	}

	const negatives = getNegativeStatusCodes();
	if (negatives.includes(statusCode)) {
		return {
			ok: false,
			reason: `HTTP status ${statusCode} is in the configured negative status codes (${negatives.join(', ')}).`,
		};
	}

	return {
		ok: false,
		reason: `HTTP status ${statusCode} is not in the configured positive status codes (${positives.join(', ')}).`,
	};
};

/**
 Regular expressions to filter log messages based on their content.
 @type {{[key: string]: RegExp}}
 */
const filters = {
	[logLevels[0]]: new RegExp(process.env.REGEXP_VERBOSE || '^$', 'gv'),
	[logLevels[1]]: new RegExp(process.env.REGEXP_INFO || '^$', 'gv'),
	[logLevels[2]]: new RegExp(process.env.REGEXP_WARNING || '^$', 'gv'),
	[logLevels[3]]: new RegExp(process.env.REGEXP_ERROR || '^$', 'gv'),
};

/**
 Minimum log level to capture.
 @type {string}
 @default 'verbose'
 */
const minLogLevel = process.env.MIN_LOG_LEVEL || logLevels[0];

/**
 Maximum log level to allow before failing the action.
 @type {string}
 @default 'info'
 */
const maxLogLevel = process.env.MAX_LOG_LEVEL || logLevels[1];

/**
 Filters out parts of the message based on the regular expression.
 @param {string} level - The log level of the message.
 @param {string} message - The log message content.
 @returns {string} - The filtered message.
 */
export const filterMessage = (level, message) => message.replace(filters[level], '').trim();

/**
 Determines if a log message should be captured based on its level.
 @param {string} level - The log level of the message.
 @returns {boolean} - True if the message should be captured, false otherwise.
 */
export const shouldCapture = level => logLevels.indexOf(level) >= logLevels.indexOf(minLogLevel);

/**
 Determines if the action should fail based on the log level.
 @param {string} level - The log level of the message.
 @returns {boolean} - True if the action should fail, false otherwise.
 */
export const shouldFail = level => logLevels.indexOf(level) > logLevels.indexOf(maxLogLevel);
