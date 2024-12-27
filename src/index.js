/*
  Using: 'composite'
  steps:
    - name: Checkout Code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'

    - name: Cache Dependencies
      uses: actions/cache@v4
      with:
        path: ~/.npm
        key: npm-${{ hashFiles('package-lock.json') }}
        restore-keys: |
          npm-${{ hashFiles('package-lock.json') }}
          npm-

    - name: Install Dependencies
      run: npm ci
      shell: bash

    - name: Setup Chromium
      run: npx playwright install chromium
      shell: bash

    - name: Set working directory
      run: cd $GITHUB_ACTION_PATH
      shell: bash

    - name: Execute Capture Script
      run: node capture-console.js
      env:
        WEBAPP_URL: ${{ inputs.webapp-url }}
        WAIT_TIME: ${{ inputs.wait-time }}
        MIN_LOG_LEVEL: ${{ inputs.min-log-level }}
        MAX_LOG_LEVEL: ${{ inputs.max-log-level }}
      shell: bash

    - name: Set Output
      id: capture-console
      run: |
        echo 'console<<EOF' >> $GITHUB_OUTPUT
        jq -c . console_output.json >> $GITHUB_OUTPUT
        echo 'EOF' >> $GITHUB_OUTPUT
      shell: bash

    - name: Format Console Output  # Step to format the console output into GitHub Flavored Markdown
      id: format_console_output
      run: |
        # Create a markdown file and add a main heading
        echo "# ${{ inputs.headline }}" > formatted_console_output.md
        # Loop through each key in the JSON file
        for key in $(jq -r 'keys[]' console_output.json); do
          # Capitalize the first character of the key
          capitalized_key=$(echo "$key" | awk '{print toupper(substr($0, 1, 1)) tolower(substr($0, 2))}')
          # Add a subheading for each log level with matching emoji if show-emoji is true
          if [ "${{ inputs.show-emoji }}" = "true" ]; then
            case "$key" in
              verbose) emoji="💬" ;;
              info) emoji="ℹ️" ;;
              warning) emoji="⚠️" ;;
              error) emoji="❌" ;;
              *) emoji="" ;;
            esac
            echo "## $emoji $capitalized_key" >> formatted_console_output.md
          else
            echo "## $capitalized_key" >> formatted_console_output.md
          fi
          # Add a code block for each log message
          echo '```' >> formatted_console_output.md
          # Add each log message
          jq -r --arg key "$key" '.[$key][]' console_output.json >> formatted_console_output.md
          # Close the code block
          echo '```' >> formatted_console_output.md
          # Add an empty line for better readability when editing
          echo "" >> formatted_console_output.md
        done
      shell: bash

    - name: Post Console Output to PR
      if: github.event_name == 'pull_request'
      uses: thollander/actions-comment-pull-request@v3
      with:
        comment-tag: ${{ inputs.comment-tag }}
        file-path: formatted_console_output.md
      env:
        GITHUB_TOKEN: ${{ env.GITHUB_TOKEN }}

    - name: Check if action should fail
      run: |
        if [ "$SHOULD_FAIL_ACTION" = "true" ]; then
          echo "Action should fail due to log level threshold."
          exit 1
        fi
      shell: bash
      env:
        SHOULD_FAIL_ACTION: ${{ env.SHOULD_FAIL_ACTION }}
*/

/*
import {promises as fs} from 'node:fs';
import {chromium} from 'playwright';
import github from '@actions/github';
*/

import process from 'node:process';
import core from '@actions/core';
import exec from '@actions/exec';

const commentTag = core.getInput('comment-tag') || 'console-log';

await exec.exec('sh', ['-c', `
    echo "Calling thollander/actions-comment-pull-request@v3"
    echo "::set-output name=comment-tag::${commentTag}"
    echo "::set-output name=file-path::formatted_console_output.md"
    echo "::set-env name=GITHUB_TOKEN::${process.env.GITHUB_TOKEN}"
    uses: thollander/actions-comment-pull-request@v3
  `]);

/*
Try {
	const minLogLevel = core.getInput('min-log-level') || 'verbose';
	const maxLogLevel = core.getInput('max-log-level') || 'info';
	const commentTag = core.getInput('comment-tag') || 'console-log';
	const headline = core.getInput('headline') || 'Console Logs';

	const browser = await chromium.launch();
	const page = await browser.newPage();

	const consoleMessages = {
		verbose: [],
		info: [],
		warning: [],
		error: [],
	};

	const logLevels = ['verbose', 'info', 'warning', 'error'];

	const shouldCapture = level => logLevels.indexOf(level) >= logLevels.indexOf(minLogLevel);
	const shouldFail = level => logLevels.indexOf(level) > logLevels.indexOf(maxLogLevel);

	let shouldFailAction = false;

	const logLevelMapping = {
		log: 'info',
		debug: 'verbose',
		info: 'info',
		error: 'error',
		warning: 'warning',
		dir: 'info',
		dirxml: 'info',
		table: 'info',
		trace: 'verbose',
		clear: 'verbose',
		startGroup: 'verbose',
		startGroupCollapsed: 'verbose',
		endGroup: 'verbose',
		assert: 'error',
		profile: 'verbose',
		profileEnd: 'verbose',
		count: 'verbose',
		timeEnd: 'verbose',
	};

	page.on('console', message => {
		const messageType = message.type();
		const logLevel = logLevelMapping[messageType] || 'info';
		if (shouldCapture(logLevel)) {
			consoleMessages[logLevel].push(message.text());
		}

		if (shouldFail(logLevel)) {
			shouldFailAction = true;
		}
	});

	const webAppUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
	const waitTime = process.env.WAIT_TIME || 5000;

	await page.goto(webAppUrl);
	await page.waitForTimeout(Number.parseInt(waitTime, 10)); // Wait for the specified time

	console.log(' ');
	console.log('Console messages:', consoleMessages);

	// Remove keys with empty arrays
	for (const key in consoleMessages) {
		if (consoleMessages[key].length === 0) {
			delete consoleMessages[key];
		}
	}

	await fs.writeFile('console_output.json', JSON.stringify(consoleMessages, null, 2));

	await browser.close();

	if (shouldFailAction) {
		console.log(' ');
		console.warn('Action should fail due to log level threshold, but will not exit here.');
		core.exportVariable('SHOULD_FAIL_ACTION', 'true');
	}

	console.log(' ');

	// Your logic to capture logs based on minLogLevel and maxLogLevel
	const capturedLogs = '...'; // Replace with actual log capturing logic

	// Post a comment to the pull request or issue
	const context = github.context;
	const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

	await octokit.issues.createComment({
		...context.repo,
		issue_number: context.issue.number,
		body: `### ${headline}\n\n${capturedLogs}`,
	});

	core.setOutput('console', capturedLogs);
} catch (error) {
	core.setFailed(error.message);
}

*/
