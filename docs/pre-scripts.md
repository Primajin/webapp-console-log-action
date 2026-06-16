# Pre-scripts

Pre-scripts let the action sign in, prepare state, or trigger navigation before the console capture window starts.

## How it works

1. The action opens `webapp-url`.
2. If `pre-script-path` is set, the action imports that module from `GITHUB_WORKSPACE`.
3. The module's default export is called.
4. When the pre-script finishes, the action waits for `wait-time` and captures all console messages emitted during that period.

If you need to begin capturing before the pre-script ends, call `startCapture()` inside the script and then perform the final click, navigation, or reload that should be observed.

## Script contract

The file referenced by `pre-script-path` must export a default async function. The action passes an object with:

- `page`: the Playwright page
- `context`: the Playwright browser context
- `browser`: the Playwright browser
- `url`: the resolved `webapp-url`
- `startCapture`: starts console collection immediately

## Credentials

Use workflow `env` values or secrets for credentials and read them from `process.env` inside the pre-script.

## Example

```js
import process from 'node:process';

export default async function loginAndCapture({page, startCapture}) {
  await page.getByLabel('Username').fill(process.env.DEMO_LOGIN_USERNAME);
  await page.getByLabel('Password').fill(process.env.DEMO_LOGIN_PASSWORD);

  await startCapture();
  await Promise.all([
    page.waitForURL('**/secure'),
    page.getByRole('button', {name: 'Login'}).click(),
  ]);
}
```
