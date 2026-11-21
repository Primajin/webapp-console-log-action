// The context-options input: Playwright browser context options as JSON (pure, unit tested).
// Ported from Primajin/screenshots-ci-action's utils.js (resolveContextOptions), with only the comments
// adjusted, so that both actions accept and refuse the same values; change both copies together.

// The Playwright context options the `context-options` input may set. Anything
// else (proxy, permissions, extraHTTPHeaders, storageState, ...) is refused, so
// the input cannot change what the action itself relies on.
const CONTEXT_OPTION_ENUMS = {
	colorScheme: ['light', 'dark', 'no-preference'],
	reducedMotion: ['reduce', 'no-preference'],
	forcedColors: ['active', 'none'],
};
const CONTEXT_OPTION_BOOLEANS = new Set(['isMobile', 'hasTouch']);
const CONTEXT_OPTION_STRINGS = new Set(['locale', 'timezoneId', 'userAgent']);
export const CONTEXT_OPTION_KEYS = [
	...Object.keys(CONTEXT_OPTION_ENUMS),
	'deviceScaleFactor',
	...CONTEXT_OPTION_BOOLEANS,
	'viewport',
	...CONTEXT_OPTION_STRINGS,
];

// The limits the browser can take
const CONTEXT_MAX_SIZE = 10_000;
const CONTEXT_MAX_SCALE = 5;

const isPlainObject = value =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const describeValue = value => JSON.stringify(value) ?? String(value);

// A BCP 47 language tag such as de-DE
function validateLocale(value) {
	try {
		if (Intl.getCanonicalLocales(value).length === 1) {
			return value;
		}
	} catch {}

	throw new Error(`context-options: "locale" must be a language tag such as "de-DE", got ${describeValue(value)}.`);
}

// An IANA time zone such as Europe/Berlin (not a UTC offset: the browser does not take those)
function validateTimeZone(value) {
	try {
		if (!/^[+\-]/v.test(value.trim())) {
			// A RangeError for a zone it does not know
			new Intl.DateTimeFormat('en', {timeZone: value}).format();
			return value;
		}
	} catch {}

	throw new Error(`context-options: "timezoneId" must be an IANA time zone such as "Europe/Berlin", got ${describeValue(value)}.`);
}

function validateString(key, value) {
	if (key === 'locale') {
		return validateLocale(value);
	}

	return key === 'timezoneId' ? validateTimeZone(value) : value;
}

// Throws for a bad value of one key
function validateContextOption(key, value) {
	if (Object.hasOwn(CONTEXT_OPTION_ENUMS, key)) {
		if (!CONTEXT_OPTION_ENUMS[key].includes(value)) {
			throw new Error(`context-options: "${key}" must be one of ${CONTEXT_OPTION_ENUMS[key].map(allowed => `"${allowed}"`).join(', ')}, got ${describeValue(value)}.`);
		}

		return value;
	}

	if (CONTEXT_OPTION_BOOLEANS.has(key)) {
		if (typeof value !== 'boolean') {
			throw new TypeError(`context-options: "${key}" must be true or false, got ${describeValue(value)}.`);
		}

		return value;
	}

	if (CONTEXT_OPTION_STRINGS.has(key)) {
		if (typeof value !== 'string' || value.trim() === '') {
			throw new TypeError(`context-options: "${key}" must be a non-empty string, got ${describeValue(value)}.`);
		}

		// The browser refuses a locale or a time zone it does not know only after it
		// was launched, so they are checked here with the same ICU data
		return validateString(key, value);
	}

	if (key === 'deviceScaleFactor') {
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > CONTEXT_MAX_SCALE) {
			throw new TypeError(`context-options: "deviceScaleFactor" must be a number above 0 and at most ${CONTEXT_MAX_SCALE}, got ${describeValue(value)}.`);
		}

		return value;
	}

	// The viewport
	const isSize = size => Number.isSafeInteger(size) && size > 0 && size <= CONTEXT_MAX_SIZE;
	if (!isPlainObject(value) || !isSize(value.width) || !isSize(value.height) || Object.keys(value).length !== 2) {
		throw new TypeError(`context-options: "viewport" must be an object like {"width": 1440, "height": 900} with whole numbers from 1 to ${CONTEXT_MAX_SIZE}, got ${describeValue(value)}.`);
	}

	return {width: value.width, height: value.height};
}

/**
 Resolve the `context-options` input: a JSON object with Playwright browser
 context options that are applied to the browser context of the capture. Only the options in CONTEXT_OPTION_KEYS are accepted.
 @param {string} [raw] The raw input; empty means no options.
 @returns {object} The validated options ({} for an empty input).
 @throws {Error} With a message that names the problem, for invalid JSON, a value that is not an object, an unknown key or a value of the wrong type.
 */
export function resolveContextOptions(raw) {
	const text = String(raw ?? '').trim();
	if (text === '') {
		return {};
	}

	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(`context-options is not valid JSON: ${error.message}`, {cause: error});
	}

	if (!isPlainObject(parsed)) {
		throw new TypeError(`context-options must be a JSON object like {"colorScheme": "dark"}, got ${Array.isArray(parsed) ? 'an array' : describeValue(parsed)}.`);
	}

	const options = {};
	for (const [key, value] of Object.entries(parsed)) {
		if (!CONTEXT_OPTION_KEYS.includes(key)) {
			throw new Error(`context-options: unknown option "${key}". Allowed: ${CONTEXT_OPTION_KEYS.join(', ')}.`);
		}

		options[key] = validateContextOption(key, value);
	}

	return options;
}
