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

### Dependencies
This action uses [http-server](https://www.npmjs.com/package/http-server) to serve the web application (only when passing `localhost` as input, [see details below](#webapp-url)) and [playwright](https://www.npmjs.com/package/playwright) to capture the console logs.
Furthermore, thanks to [thollander/actions-comment-pull-request](https://github.com/thollander/actions-comment-pull-request) for the comment functionality.

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
          webapp-url: 'http://localhost'
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
          webapp-url: 'https://your-deployed-app.com'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For more examples, see the [workflow examples](.github/workflows).

## Inputs
| Input            | Description                                                                                       | Required | Default       |
|------------------|---------------------------------------------------------------------------------------------------|----------|---------------|
| `artifact-name`  | The name of the artifact to download (required if `webapp-url` points to localhost)               | false    |               |
| `comment-tag`    | The tag to use for the comment - so that consecutive pushes will update the same comment          | false    | console-log   |
| `headline`       | The headline for the console logs                                                                 | false    | Console Logs  |
| `max-log-level`  | The maximum log level to allow (verbose, info, warning, error)                                    | false    | info          |
| `min-log-level`  | The minimum log level to capture (verbose, info, warning, error)                                  | false    | verbose       |
| `port`           | The port to run the http-server on (set to 3000 if `webapp-url` is localhost and port is not set) | false    |               |
| `regexp-error`   | Regular expression pattern to filter error logs                                                   | false    |               |
| `regexp-info`    | Regular expression pattern to filter info logs                                                    | false    |               |
| `regexp-verbose` | Regular expression pattern to filter verbose logs                                                 | false    |               |
| `regexp-warning` | Regular expression pattern to filter warning logs                                                 | false    |               |
| `show-emoji`     | Whether to show emojis in the output                                                              | false    | true          |
| `wait-time`      | The wait time before capturing logs (in milliseconds)                                             | false    | 2500          |
| <a name="webapp-url"></a>`webapp-url` | The URL of the web application                                               | true     |               |

## Outputs
| Output    | Description              |
|-----------|--------------------------|
| `console` | The captured console log |

## License
This project is licensed under the Unlicense license - see the [LICENSE](LICENSE) file for details.
