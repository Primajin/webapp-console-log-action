// Fixture for the _fail_pre-script-error scenario: a pre-script that always throws
export default async function failingPreScript() {
	throw new Error('Simulated pre-script failure');
}
