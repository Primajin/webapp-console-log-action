# WebApp Console Log Action
An action to capture console logs from a web application and post them as a comment on a pull request.

### Motivation
Even when having a CI/CD pipeline with tests, screenshots and other checks in place, it can occur that small changes or
versions of dependencies can break the application in a way that is not covered by the tests.
This action helps to capture console logs from the web application and post them as a comment on a pull request, so that
issues arise as early as possible - especially when the pull request was opened automatically by a bot like dependabot or renovate.

### Use cases
- Capture console logs from a web application deployed on a server
- Capture console logs from a web application that was built in a previous workflow
- Capture console logs from authenticated areas after a login flow

### Dependencies
This action uses [http-server](https://www.npmjs.com/package/http-server) to serve the web application (only when `url` is a [local URL](#local-urls)) and [playwright](https://www.npmjs.com/package/playwright) to capture the console logs.
Both are installed from the lockfile of this action (`npm ci --omit=dev`), so the versions are pinned and nothing is fetched at run time beyond that and the Chromium browser, which is cached between runs.
The action does not check out your repository, that is up to your workflow. It only needs your files for [`pre-script-path`](#example-with-a-login-pre-script), because the script is read from your workspace: add `actions/checkout` before the action then, or it stops at the start and asks you for it.
The comment is posted with the GitHub API through [@actions/github](https://www.npmjs.com/package/@actions/github) (it used to be [thollander/actions-comment-pull-request](https://github.com/thollander/actions-comment-pull-request), thanks for that; a comment that this older version posted is still found and updated in place).

## Usage
To use this action, include it in your GitHub Actions workflow:

### Example with a freshly built app
```yaml
name: Capture Console Logs

on: [push, pull_request]

permissions:
  pull-requests: write

jobs:
  capture-console-logs:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Have your web-app built
        run: build stuff or get from other build action

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: your-artifact-name
          path: path-to-app/

      - name: Capture Console Logs
        uses: Primajin/webapp-console-log-action@v1
        with:
          artifact-name: your-artifact-name
          url: 'http://localhost'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Example with an already deployed app
```yaml
name: Capture Console Logs

on: [push, pull_request]

permissions:
  pull-requests: write

jobs:
  capture-console-logs:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Capture Console Logs
        uses: Primajin/webapp-console-log-action@v1
        with:
          url: 'https://your-deployed-app.com'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For more examples, see the [workflow examples](.github/workflows).

### Example with a login pre-script
Create a repo-local script that logs in before the capture window starts:

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

Then reference it from the workflow. The script is read from your workspace and the action does not check out your repository, so check it out in the job before the action:

```yaml
- name: Checkout code
  uses: actions/checkout@v4

- name: Capture Console Logs
  uses: Primajin/webapp-console-log-action@v1
  with:
    max-log-level: error
    pre-script-path: .github/scripts/the-internet-login.js
    pre-script-timeout: 30000
    regexp-error: '^Failed to load resource: net::ERR_NAME_NOT_RESOLVED$'
    wait-time: 1000
    url: 'https://the-internet.herokuapp.com/login'
  env:
    DEMO_LOGIN_PASSWORD: ${{ secrets.DEMO_LOGIN_PASSWORD }}
    DEMO_LOGIN_USERNAME: ${{ secrets.DEMO_LOGIN_USERNAME }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The action opens `url`, runs the pre-script, and starts collecting console output. Call `startCapture()` inside the script if you want to begin collecting before the script ends. In the example above, the script proves login succeeded by waiting for the secure-area success message and the Logout link after the redirect. The public demo site can emit unrelated `ERR_NAME_NOT_RESOLVED` resource errors in CI, so the workflow filters those out. See [docs/pre-scripts.md](docs/pre-scripts.md) for the full contract.

## Migrating to v2
v2 no longer runs `actions/checkout` inside the action. A second checkout re-checked out your commit and cleaned untracked files, which could delete build output your job had produced in the workspace.

- **What breaks:** workflows that set `pre-script-path` without their own `actions/checkout` step before the action. The pre-script was only found because v1 checked out the repository itself. With v2 the action stops at its start with the error `pre-script-path ... does not point to an existing file ... add an actions/checkout step before it, or fix the path`.
- **The fix:** add `- uses: actions/checkout@v4` before the action (or point `pre-script-path` to a file that exists in the workspace at that moment, for example one you created in an earlier step) and change `@v1` to `@v2`.
- **What does not change:** nothing else. Workflows without `pre-script-path` need no change, and neither do inputs, outputs and the comment.

## Inputs
| Input                               | Description                                                                                                                                                        | Required | Default       |
|-------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|---------------|
| `artifact-name`                     | The name of the artifact to download (required if `url` is a [local URL](#local-urls))                                                                              | false    |               |
| `comment-tag`                       | The tag to use for the comment, so that `comment-mode: update` can find it (a hidden marker line in the comment; comments of earlier versions are found by their old marker). An empty tag always posts a new comment | false    | console-log   |
| `comment-section`                   | Name of this call's section, so that several calls share ONE comment (the one of `comment-tag`): each call replaces only its own section and leaves the others as they are. Needs `comment-mode: update` and a `comment-tag`, otherwise it is ignored with a warning. See [Sections](#sections-in-one-comment) | false    |               |
| `comment`                           | Whether to post the logs to the pull request. `false`, `0`, `no` and `off` skip the comment; the logs are still captured, set as the `console` output and fail the action by log level | false    | true          |
| `comment-footer`                    | Add a small footer with the commit and a link to the workflow run to the comment. `false`, `0`, `no` and `off` leave it out                                         | false    | true          |
| `comment-headline`                  | The headline of the comment. Wins over the deprecated `headline` when both are set                                                                                 | false    | Console Logs  |
| `comment-mode`                      | `update` edits the comment posted by an earlier run in place (found by `comment-tag`), `new` always posts a new comment                                            | false    | update        |
| `headline`                          | **Deprecated**, use `comment-headline`. Alias of `comment-headline`, kept so existing workflows keep working                                                       | false    |               |
| `max-log-level`                     | The maximum log level to allow (verbose, info, warning, error)                                                                                                     | false    | info          |
| `min-log-level`                     | The minimum log level to capture (verbose, info, warning, error)                                                                                                   | false    | verbose       |
| `negative-statuses`                 | Comma-separated list of HTTP status codes that explicitly fail the action (e.g. `"404,500"`). Any code not in `positive-statuses` also fails when validation is on. | false    |               |
| `positive-statuses`                 | Comma-separated list of HTTP status codes considered successful (e.g. `"200,201"`). Defaults to `200` when not set.                                                | false    |               |
| `pre-script-path`                   | Path to a JavaScript module, relative to the workspace or absolute, whose default export is an async function receiving `{ browser, context, page, startCapture, url }`. Use it to log in or prepare the page before the capture, for example to dismiss a cookie banner. Console capture starts when it calls `startCapture()`, or when it returns if it never does. If it fails, the comment reports why and the action fails. Your job needs `actions/checkout` before the action. | false    |               |
| `pre-script-timeout`                | Maximum time in milliseconds the pre-script may run before the action fails. Defaults to 30000.                                                                                                                         | false    | 30000         |
| `port`                              | The port to run the http-server on, digits only from 1 to 65535 (set to 3000 if `url` is a local URL and port is not set)                                     | false    |               |
| `regexp-error`                      | Regular expression pattern to <a href="#filter-note" aria-describedby="footnotes-label" role="doc-noteref">filter<sup>1</sup></a> matching parts from error logs   | false    |               |
| `regexp-info`                       | Regular expression pattern to <a href="#filter-note" aria-describedby="footnotes-label" role="doc-noteref">filter<sup>1</sup></a> matching parts from info logs    | false    |               |
| `regexp-verbose`                    | Regular expression pattern to <a href="#filter-note" aria-describedby="footnotes-label" role="doc-noteref">filter<sup>1</sup></a> matching parts from verbose logs | false    |               |
| `regexp-warning`                    | Regular expression pattern to <a href="#filter-note" aria-describedby="footnotes-label" role="doc-noteref">filter<sup>1</sup></a> matching parts from warning logs | false    |               |
| `show-emoji`                        | Whether to show emojis in the output                                                                                                                               | false    | true          |
| `validate-status`                   | Whether to validate the HTTP response status code before log collection. Set to `false` to disable.                                                                | false    | true          |
| `wait-time`                         | The wait time before capturing logs (in milliseconds)                                                                                                              | false    | 2500          |
| `wait-until`                        | When to consider the navigation succeeded: `load`, `domcontentloaded`, `networkidle` or `commit` (the legacy Puppeteer values `networkidle0` and `networkidle2` map to `networkidle`). An unknown value logs a warning and uses the default. `wait-time` is waited on top of it | false    | load          |
| `wait-for-selector`                 | Wait for this selector to be attached to the DOM before the capture ends (after the `pre-script-path` script, if any). If it does not appear within the timeout the error is logged and the capture goes on | false    |               |
| `wait-for-selector-visible`         | Wait for the element to be visible, not only attached. Needs `wait-for-selector`; wins over `wait-for-selector-hidden`                                             | false    | false         |
| `wait-for-selector-hidden`          | Wait for the element to be gone or hidden. Needs `wait-for-selector`                                                                                               | false    | false         |
| `wait-for-selector-timeout`         | Maximum time to wait for the selector in milliseconds, `0` disables the timeout                                                                                    | false    | 30000         |
| `url`                               | The URL of the web application. One of `url` and the deprecated `webapp-url` is required; `url` wins when both are set                                             | true*    |               |
| <a id="webapp-url"></a>`webapp-url` | **Deprecated**, use `url`. Alias of `url`, kept so existing workflows keep working (the run logs a deprecation warning)                                            | false*   |               |

\* Neither `url` nor `webapp-url` is marked `required` in `action.yml`, because either one satisfies the action. If both are empty the run fails at its first step with `url is required`.

### Waiting for the page

`wait-until` decides when the navigation counts as done. Its default is `load`, which is what the action always waited for; screenshots-ci-action defaults to `networkidle`, here the default is kept so that existing workflows behave as before. After the navigation (and the pre-script, if you set one) the action waits for `wait-for-selector` if you set it, then for `wait-time`. Console messages are captured throughout, so what the page logs while waiting is part of the comment. A selector that never shows up is logged and the capture goes on.

### Local URLs

The action decides once, in its first steps, whether `url` is local. A URL is local when it uses plain `http://` and its host is `localhost`, `127.0.0.1` or `[::1]`, optionally followed by a port and a path (`http://localhost:8080/page`). The scheme and host are case-insensitive, so `HTTP://LOCALHOST` is local as well.

For a local URL the action requires `artifact-name`, downloads that artifact into `app/` and serves it with http-server on `port` (3000 when not set; a port inside the URL is replaced by it). `https://localhost` is not local, because http-server only serves plain http, and neither is a host that merely starts with `localhost`, such as `http://localhost.example.com`.

### HTTP status code validation

By default, the action validates the HTTP response status code before collecting console logs. If the page returns a non-`200` status code, the action fails early with a clear error message instead of reporting a misleading "no logs found" result.

**Precedence rules:**

1. If `validate-status` is `false`, all status codes are accepted and validation is skipped entirely.
2. If the received status code is in `positive-statuses`, the action continues normally.
3. If the received status code is in `negative-statuses`, the action fails with a reason referencing the negative set.
4. If the received status code is not in either set, the action fails with a reason referencing the positive set.

Codes not listed in either set are treated as failures. Supported format: comma-separated integers (e.g. `"200,201,301"`). Codes outside the range 100–599 or non-integer values are silently ignored.

**Examples:**

```yaml
# Default: expect 200, fail on anything else
- uses: Primajin/webapp-console-log-action@v1
  with:
    url: 'https://example.com'

# Accept both 200 and 404 as valid responses
- uses: Primajin/webapp-console-log-action@v1
  with:
    positive-statuses: '200,404'
    url: 'https://example.com/may-not-exist'

# Disable validation entirely (any status passes)
- uses: Primajin/webapp-console-log-action@v1
  with:
    validate-status: 'false'
    url: 'https://example.com'
```

<footer role="doc-footnote">
  <h5 id="footnotes-label">Footnotes</h5>
  <ol>
    <li id="filter-note">
      Log messages (or parts of them) that match the regular expression pattern will be replaced with empty string.<br>
      If everything is replaced with empty string, the log will not be captured.<br>
      This is useful to filter out parts of the log that are expected or contain sensitive information.
    </li>
  </ol>
</footer>

### Sections in one comment

With `comment-section`, several calls of the action on the same pull request (for example one per page) share ONE comment instead of posting one each. Every call puts its logs into a collapsible section titled with the section name and replaces only that section the next time it runs; sections appear in the order of their first run, and names that differ only in case, spacing or punctuation are the same section. The headline and the footer belong to the whole comment, the latest call wins. Run the calls one after the other (for example as consecutive steps): parallel calls with the same tag can overwrite each other's update.

```yaml
- uses: Primajin/webapp-console-log-action@v1
  with:
    comment-section: Home
    url: 'https://example.com/'
- uses: Primajin/webapp-console-log-action@v1
  with:
    comment-section: Login
    url: 'https://example.com/login'
```

`comment-section` is ignored, with a warning, for `comment-mode: new` and for an empty `comment-tag`, because both always post a whole new comment. A name without any letter or digit fails the run, since the section could not be told apart from the others.

## Outputs
| Output    | Description              |
|-----------|--------------------------|
| `console` | The captured console log |

## License
This project is licensed under the Unlicense license - see the [LICENSE](LICENSE) file for details.

## Comment

The comment will look something like this:

<table>
  <tr>
    <td colspan="2"></td>
  </tr>
  <tr>
    <td><img src="https://avatars.githubusercontent.com/in/15368?s=80&v=4" alt="@github-actions" width="40" height="40" /></td>
    <td><b>github-actions</b> (bot) commented 2 minutes ago &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
  </tr>
  <tr>
    <td></td>
<td>

## Console Logs
## ❌ Error
```text
This is an error
```

## ℹ️ Info
```text
This is an info
This is a log
This is another log
```

## 💬 Verbose
```text
This is a debug message
```

## ⚠️ Warning
```text
This is a warning
```
</td>
  </tr>
</table>
