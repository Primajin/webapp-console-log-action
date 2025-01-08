# WebApp Console Log Action

An action to capture and post console logs from a web application.

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

## Inputs

| Input            | Description                                                                                       | Required | Default       |
|------------------|---------------------------------------------------------------------------------------------------|----------|---------------|
| `artifact-name`  | The name of the artifact to download (required if `webapp-url` points to localhost)               | false    |               |
| `comment-tag`    | The tag to use for the comment - so that consecutive pushes will update the same comment          | false    | console-log   |
| `headline`       | The headline for the console logs                                                                 | false    | Console Logs  |
| `max-log-level`  | The maximum log level to allow (verbose, info, warning, error)                                    | false    | info          |
| `min-log-level`  | The minimum log level to capture (verbose, info, warning, error)                                  | false    | verbose       |
| `port`           | The port to run the http-server on (set to 3000 if `webapp-url` is localhost and port is not set) | false    |               |
| `show-emoji`     | Whether to show emojis in the output                                                              | false    | true          |
| `wait-time`      | The wait time before capturing logs (in milliseconds)                                             | false    | 2500          |
| `webapp-url`     | The URL of the web application                                                                    | true     |               |

## Outputs

| Output         | Description                      |
|----------------|----------------------------------|
| `console`  | The captured console log         |

## License

This project is licensed under the Unlicense license - see the [LICENSE](LICENSE) file for details.
