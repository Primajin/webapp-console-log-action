const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(msg.text()));

  const webAppUrl = process.env.WEBAPP_URL || 'http://localhost:3000';
  const waitTime = process.env.WAIT_TIME || 5000;

  await page.goto(webAppUrl);
  await page.waitForTimeout(parseInt(waitTime)); // Wait for the specified time

  fs.writeFileSync('console_output.txt', consoleMessages.join('\n'));

  await browser.close();
})();