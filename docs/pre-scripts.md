# Pre-scripts

Pre-scripts let the action sign in, prepare state, or trigger navigation before the console capture window starts.

## How it works

1. The action opens `webapp-url`.
2. If `pre-script-path` is set, the action imports that module from `GITHUB_WORKSPACE`. The action does not check out your repository, so run `actions/checkout` in your job before it (see [the workflow example](#workflow)).
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

The path is checked at the very start of the action: when it is set and does not point to an existing file (absolute, or relative to `GITHUB_WORKSPACE`), the action fails with an error that tells you to add `actions/checkout` before it or to fix the path, before anything is installed or started. Versions up to v1 ran their own checkout, so for a caller that relied on it this is a breaking change, see [Migrating to v2](../README.md#migrating-to-v2).

A script that cannot be loaded (syntax error, no default export, an error while importing) fails the action with `Failed to execute pre-script "<path>": ...`, the same prefix as an error thrown or a timeout while it runs.

A failing pre-script does not stop the later steps of the action. The action writes an empty console output, posts the comment with `Pre-script failed: <message>` (prefixed with the cross mark when `show-emoji` is on) and then fails the job, so the real error is visible in the pull request.

## Credentials

Use workflow `env` values or secrets for credentials and read them from `process.env` inside the pre-script.

## Example

<a id="workflow"></a>The workflow checks out the repository first, so that the script exists in the workspace, and then runs the action with `pre-script-path`:

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Capture Console Logs
    uses: Primajin/webapp-console-log-action@v1
    with:
      pre-script-path: .github/scripts/the-internet-login.js
      webapp-url: 'https://the-internet.herokuapp.com/login'
    env:
      DEMO_LOGIN_PASSWORD: ${{ secrets.DEMO_LOGIN_PASSWORD }}
      DEMO_LOGIN_USERNAME: ${{ secrets.DEMO_LOGIN_USERNAME }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The script, `.github/scripts/the-internet-login.js`:

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
  await page.getByText('You logged into a secure area!').waitFor();
  await page.getByRole('link', {name: 'Logout'}).waitFor();
}
```

After the click, wait for a signal that only appears for authenticated users, such as a redirect, success message, account menu, or logout button. In the example above, the script waits for both the secure URL and the logged-in success UI before it returns.

If you use a public demo site for testing, be aware that it may load third-party resources that fail independently of your app. You can filter known-noise messages with `regexp-error` in the workflow that calls the action.
