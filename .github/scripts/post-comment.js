const fs = require('fs');
const { Octokit } = require("@octokit/rest");

const token = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: token });
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const pull_number = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)\/merge/)[1];

async function postComment() {
  const consoleOutput = fs.readFileSync('console_output.txt', 'utf8');

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body: `### Console Output\n\`\`\`\n${consoleOutput}\n\`\`\``
  });
}

postComment().catch(err => {
  console.error(err);
  process.exit(1);
});