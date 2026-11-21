// Problems of the page that was captured: uncaught exceptions, errors in the
// console from before the log capture started, and a selector that was never
// reached. They are shown as a warning in the PR comment and as annotations of
// the workflow run, and never fail the run: a page that broke is exactly when
// its logs are most worth having. Adapted from Primajin/screenshots-ci-action's
// page-problems.js; this action captures one page, so a problem has no label.
//
// Console errors that the log capture records anyway (they are in the Error
// section of the comment) are not repeated here, see attach().

export const MAX_ANNOTATIONS = 10;

const oneLine = text => String(text ?? '').replaceAll(/\s+/gv, ' ').trim();

/**
 Collect the problems of the page of one run.
 @returns {{add: (text: string) => void, attach: (page: object, isConsoleErrorReported?: () => boolean) => void, list: () => {text: string, count: number}[]}} add() records a problem (the same text is counted, not repeated); attach() listens to a page's uncaught errors and console errors; list() answers the problems in the order they happened.
 */
export function createProblemCollector() {
	const problems = [];
	const add = text => {
		const line = oneLine(text);
		if (line === '') {
			return;
		}

		const known = problems.find(problem => problem.text === line);
		if (known) {
			known.count++;
		} else {
			problems.push({text: line, count: 1});
		}
	};

	return {
		add,
		// Right after the page is created and before it navigates, or the errors of loading are missed.
		// A console error is a problem only while isConsoleErrorReported() says so: the log capture
		// shows the console errors it records itself (in the Error section), the ones from before it
		// started (a pre-script phase) would otherwise be nowhere.
		attach(page, isConsoleErrorReported = () => true) {
			page.on('pageerror', error => {
				add(`pageerror: ${error?.message ?? error}`);
			});
			page.on('console', message => {
				if (message.type() === 'error' && isConsoleErrorReported()) {
					add(`console: ${message.text()}`);
				}
			});
		},
		list: () => problems.map(problem => ({...problem})),
	};
}

/**
 The note for a problem that happened more than once.
 @param {number} count How often it happened.
 @returns {string} " (3 times)", or nothing for a problem that happened once.
 */
export function repeatNote(count) {
	return count > 1 ? ` (${count} times)` : '';
}

/**
 The text of a problem as it is shown, with how often it happened.
 @param {{text: string, count: number}} problem A collected problem.
 @returns {string} The text, with " (3 times)" when it repeated.
 */
export function describeProblem({text, count}) {
	return `${text}${repeatNote(count)}`;
}

/**
 Emit the problems as annotations of the workflow run, the first ones only
 (GitHub shows few annotations per step); the rest is in the log.
 @param {{text: string, count: number}[]} problems The collected problems.
 @param {(text: string, properties: {title: string}) => void} warn Emits an annotation, core.warning.
 @param {(message: string) => void} [log] Where the problems beyond the limit go.
 @returns {void}
 */
export function annotateProblems(problems, warn, log = () => {}) {
	for (const [index, problem] of problems.entries()) {
		const text = describeProblem(problem);
		if (index < MAX_ANNOTATIONS) {
			warn(text, {title: 'Page problem'});
		} else {
			log(`Page problem: ${text}`);
		}
	}
}
