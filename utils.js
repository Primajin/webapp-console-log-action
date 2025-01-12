import process from 'node:process';

/**
 * Decodes a base64 encoded string.
 * @param {string} encoded - The base64 encoded string.
 * @returns {string} - The decoded string.
 */
const decodeBase64 = encoded => Buffer.from(encoded, 'base64').toString('utf8');

/**
 * Array of log levels in order of severity.
 * @type {string[]}
 */
export const logLevels = ['verbose', 'info', 'warning', 'error'];

console.log('Environment Variable:', process.env.REGEXP_WARNING);

try {
	const regex = new RegExp(decodeBase64(process.env.REGEXP_WARNING), 'g');
	console.log('Regular Expression:', regex);
} catch (error) {
	console.error('Error creating regular expression:', error.message);
}

/**
 * Regular expressions to filter log messages based on their content.
 * @type {Object.<string, RegExp>}
 */
const filters = {
	[logLevels[0]]: new RegExp(decodeBase64(process.env.REGEXP_VERBOSE || 'Xl4='), 'g'),
	[logLevels[1]]: new RegExp(decodeBase64(process.env.REGEXP_INFO || 'Xl4='), 'g'),
	[logLevels[2]]: new RegExp(decodeBase64(process.env.REGEXP_WARNING || 'Xl4='), 'g'),
	[logLevels[3]]: new RegExp(decodeBase64(process.env.REGEXP_ERROR || 'Xl4='), 'g'),
};

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
 * Filters out parts of the message based on the regular expression.
 * @param {string} level - The log level of the message.
 * @param {string} message - The log message content.
 * @returns {string} - The filtered message.
 */
export const filterMessage = (level, message) => message.replace(filters[level], '').trim();

/**
 * Determines if a log message should be captured based on its level.
 * @param {string} level - The log level of the message.
 * @returns {boolean} - True if the message should be captured, false otherwise.
 */
export const shouldCapture = level => logLevels.indexOf(level) >= logLevels.indexOf(minLogLevel);

/**
 * Determines if the action should fail based on the log level.
 * @param {string} level - The log level of the message.
 * @returns {boolean} - True if the action should fail, false otherwise.
 */
export const shouldFail = level => logLevels.indexOf(level) > logLevels.indexOf(maxLogLevel);
