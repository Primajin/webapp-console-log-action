import process from 'node:process';

export default async function loginAndCapture({page, startCapture}) {
	const username = process.env.DEMO_LOGIN_USERNAME || 'tomsmith';
	const password = process.env.DEMO_LOGIN_PASSWORD || 'SuperSecretPassword!';

	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);

	await startCapture();
	await Promise.all([
		page.waitForURL('**/secure'),
		page.getByRole('button', {name: 'Login'}).click(),
	]);
	await page.waitForLoadState('networkidle');
}
