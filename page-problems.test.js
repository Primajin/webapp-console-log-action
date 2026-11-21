import {describe, expect, test} from 'vitest';
import {
	MAX_ANNOTATIONS,
	annotateProblems,
	createProblemCollector,
	describeProblem,
	repeatNote,
} from './page-problems.js';

// A page double that remembers its listeners
const fakePage = () => {
	const listeners = new Map();
	return {
		on(event, listener) {
			listeners.set(event, [...listeners.get(event) ?? [], listener]);
		},
		emit(event, argument) {
			for (const listener of listeners.get(event) ?? []) {
				listener(argument);
			}
		},
		listenerCount: event => (listeners.get(event) ?? []).length,
	};
};

const consoleMessage = (type, text) => ({type: () => type, text: () => text});

describe('createProblemCollector', () => {
	test('starts empty', () => {
		expect(createProblemCollector().list()).toEqual([]);
	});

	test('records uncaught exceptions and console errors of an attached page', () => {
		const collector = createProblemCollector();
		const page = fakePage();
		collector.attach(page);
		page.emit('pageerror', new Error('boom'));
		page.emit('console', consoleMessage('error', 'Failed to load resource'));
		expect(collector.list()).toEqual([
			{text: 'pageerror: boom', count: 1},
			{text: 'console: Failed to load resource', count: 1},
		]);
	});

	test('ignores every other console type', () => {
		const collector = createProblemCollector();
		const page = fakePage();
		collector.attach(page);
		for (const type of ['log', 'warning', 'info', 'debug', 'trace']) {
			page.emit('console', consoleMessage(type, 'nothing'));
		}

		expect(collector.list()).toEqual([]);
	});

	test('listens to exactly pageerror and console', () => {
		const page = fakePage();
		createProblemCollector().attach(page);
		expect(page.listenerCount('pageerror')).toBe(1);
		expect(page.listenerCount('console')).toBe(1);
	});

	test('skips a console error the log capture records itself, but never an uncaught exception', () => {
		const collector = createProblemCollector();
		const page = fakePage();
		let isCaptureRunning = false;
		collector.attach(page, () => !isCaptureRunning);
		page.emit('console', consoleMessage('error', 'before the capture'));
		isCaptureRunning = true;
		page.emit('console', consoleMessage('error', 'in the Error section'));
		page.emit('pageerror', new Error('not a console message'));
		expect(collector.list().map(problem => problem.text)).toEqual(['console: before the capture', 'pageerror: not a console message']);
	});

	test('counts the same problem instead of repeating it', () => {
		const collector = createProblemCollector();
		const page = fakePage();
		collector.attach(page);
		for (let index = 0; index < 3; index++) {
			page.emit('console', consoleMessage('error', 'Failed to load resource: 404'));
		}

		expect(collector.list()).toEqual([{text: 'console: Failed to load resource: 404', count: 3}]);
	});

	test('records a problem added by hand, such as a selector that was never reached', () => {
		const collector = createProblemCollector();
		collector.add('never reached .ready');
		expect(collector.list()).toEqual([{text: 'never reached .ready', count: 1}]);
	});

	test('puts a message on one line and drops empty ones', () => {
		const collector = createProblemCollector();
		collector.add('  line one\n\n   line   two\t');
		collector.add(' \t ');
		collector.add(undefined);
		expect(collector.list()).toEqual([{text: 'line one line two', count: 1}]);
	});

	test('copes with something thrown that is not an Error', () => {
		const collector = createProblemCollector();
		const page = fakePage();
		collector.attach(page);
		page.emit('pageerror', 'a string');
		page.emit('pageerror', undefined);
		expect(collector.list().map(problem => problem.text)).toEqual(['pageerror: a string', 'pageerror: undefined']);
	});

	test('answers copies, so the list cannot be changed from outside', () => {
		const collector = createProblemCollector();
		collector.add('a');
		collector.list()[0].count = 99;
		expect(collector.list()[0].count).toBe(1);
	});
});

describe('repeatNote and describeProblem', () => {
	test('name the number of times only for a problem that happened more than once', () => {
		expect(repeatNote(1)).toBe('');
		expect(repeatNote(0)).toBe('');
		expect(repeatNote(2)).toBe(' (2 times)');
		expect(describeProblem({text: 'a', count: 1})).toBe('a');
		expect(describeProblem({text: 'a', count: 4})).toBe('a (4 times)');
	});
});

describe('annotateProblems', () => {
	const make = count => Array.from({length: count}, (_, index) => ({text: `problem ${index}`, count: 1}));

	test('warns with the count of a repeated problem and a title', () => {
		const warnings = [];
		annotateProblems([{text: 'pageerror: x', count: 2}], (text, properties) => {
			warnings.push([text, properties]);
		});
		expect(warnings).toEqual([['pageerror: x (2 times)', {title: 'Page problem'}]]);
	});

	test('emits at most ten annotations and logs the rest', () => {
		const warnings = [];
		const logs = [];
		annotateProblems(make(13), text => {
			warnings.push(text);
		}, message => {
			logs.push(message);
		});
		expect(MAX_ANNOTATIONS).toBe(10);
		expect(warnings).toHaveLength(10);
		expect(logs).toEqual(['Page problem: problem 10', 'Page problem: problem 11', 'Page problem: problem 12']);
	});

	test('does nothing without problems', () => {
		const warnings = [];
		annotateProblems([], text => {
			warnings.push(text);
		});
		expect(warnings).toEqual([]);
	});
});
