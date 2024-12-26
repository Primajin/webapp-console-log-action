# WebApp Console Log Action

An action to capture and post console logs from a web application.

## Usage

To use this action, include it in your GitHub Actions workflow:

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

      - name: Serve web-app locally or for example publish to gh-pages
        run: npx http-server ./ -p 3000 &

      - name: Capture Console Logs
        uses: Primajin/webapp-console-log-action@v1
        with:
          webapp-url: 'http://localhost:3000'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input            | Description                                                                 | Required | Default       |
|------------------|-----------------------------------------------------------------------------|----------|---------------|
| `webapp-url`     | The URL of the web application                                              | true     |               |
| `wait-time`      | The wait time before capturing logs (in milliseconds)                       | false    | 2500          |
| `show-emoji`     | Whether to show emojis in the output                                        | false    | true          |
| `min-log-level`  | The minimum log level to capture (verbose, info, warning, error)            | false    | verbose       |
| `fail-on-log-level` | The minimum log level to fail the action (verbose, info, warning, error) | false    | error         |
| `comment-tag`    | The tag to use for the comment                                              | false    | console-log   |
| `headline`       | The headline for the console logs                                           | false    | Console Logs  |

## Outputs

| Output         | Description                      |
|----------------|----------------------------------|
| `console`  | The captured console log         |

## License

This project is licensed under the Unlicense license - see the [LICENSE](LICENSE) file for details.
