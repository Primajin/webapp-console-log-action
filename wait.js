// How long to wait for the page: the navigation event and a selector (pure helpers except
// waitForConfiguredSelector, unit tested). Adapted from Primajin/screenshots-ci-action's
// utils.js; the default navigation event is "load" here, which is what page.goto waits for
// when it is not told otherwise and what this action always did.

export const DEFAULT_WAITUNTIL_OPTION = 'load';
export const DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT = 30_000; // 30 seconds

// Values accepted by Playwright's page.goto({ waitUntil }).
const PLAYWRIGHT_WAITUNTIL_OPTIONS = new Set([
	'load',
	'domcontentloaded',
	'networkidle',
	'commit',
]);

// Legacy Puppeteer values mapped onto their closest Playwright equivalent.
// Playwright has a single network-idle mode (no network connections for 500ms),
// which is closest to Puppeteer's networkidle0; networkidle2 is approximated.
const LEGACY_WAITUNTIL_MAP = {
	networkidle0: 'networkidle',
	networkidle2: 'networkidle',
};

/**
 Resolve the `wait-until` input to a Playwright value.
 Unknown / empty values fall back to the default.
 @param {string} [input] Raw wait-until input.
 @returns {{ value: string, fallback: boolean, mappedFrom?: string }} The Playwright value and how it was derived.
 */
export function mapWaitUntil(input) {
	const raw = String(input || '').trim().toLowerCase();
	if (!raw) {
		return {value: DEFAULT_WAITUNTIL_OPTION, fallback: false};
	}

	if (PLAYWRIGHT_WAITUNTIL_OPTIONS.has(raw)) {
		return {value: raw, fallback: false};
	}

	if (Object.hasOwn(LEGACY_WAITUNTIL_MAP, raw)) {
		return {
			value: LEGACY_WAITUNTIL_MAP[raw],
			fallback: false,
			mappedFrom: raw,
		};
	}

	return {value: DEFAULT_WAITUNTIL_OPTION, fallback: true};
}

/**
 Build the log messages for a mapped waitUntil input.
 @param {string} input Raw waitUntil input.
 @param {{ value: string, fallback: boolean, mappedFrom?: string }} result Result of mapWaitUntil.
 @returns {{ warning?: string, notice?: string }} Messages to log, if any.
 */
export function describeWaitUntil(input, result) {
	const {value, fallback, mappedFrom} = result;
	const legacy = `wait-until "${mappedFrom}" is a legacy Puppeteer value, using Playwright's "${value}".`;
	return {
		warning: fallback ? `Unknown wait-until "${input}", using "${value}".` : undefined,
		notice: mappedFrom ? legacy : undefined,
	};
}

/**
 Build the arguments for Playwright's page.waitForSelector.
 - visible -> state "visible", hidden -> state "hidden", else "attached".
 If both are set, "visible" wins.
 - timeout: empty/invalid/negative -> 30000, 0 -> 0 (timeout disabled).
 @param {{ visible?: boolean, hidden?: boolean, timeout?: string|number }} opts Selector wait settings.
 @returns {{ state: 'attached'|'visible'|'hidden', timeout: number }} Options for page.waitForSelector.
 */
export function buildSelectorWaitOptions({visible, hidden, timeout} = {}) {
	let state = 'attached';
	if (visible) {
		state = 'visible';
	} else if (hidden) {
		state = 'hidden';
	}

	const raw = String(timeout ?? '').trim();
	let parsed = raw === '' ? NaN : Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) {
		parsed = DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT;
	}

	return {state, timeout: parsed};
}

/**
 Wait for the configured selector. A timeout must not break the flow, so the
 error is logged and the run goes on (the logs captured so far are kept).
 @param {{waitForSelector: (selector: string, options: object) => Promise<unknown>}} page The page to wait on.
 @param {string} selector The selector; empty means do not wait.
 @param {object} options Options for page.waitForSelector, see buildSelectorWaitOptions.
 @returns {Promise<boolean>} True when the wait failed (timed out), false when the selector was reached or there was nothing to wait for.
 */
export async function waitForConfiguredSelector(page, selector, options) {
	if (!selector) {
		return false;
	}

	try {
		await page.waitForSelector(selector, options);
		return false;
	} catch (error) {
		console.error(error);
		return true;
	}
}
