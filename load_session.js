// load-session.js
const fs = require('fs');

async function loadSession(context, page) {
  const session = JSON.parse(fs.readFileSync('session.json', 'utf-8'));

  // Load cookies into context
  await context.addCookies(session.cookies);

  // Load localStorage on page
  await page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' });
  await page.evaluate(storage => {
    for (const [key, value] of Object.entries(storage)) {
      localStorage.setItem(key, value);
    }
  }, session.localStorage);

  // Reload to apply session
  await page.reload({ waitUntil: 'networkidle' });
}

module.exports = { loadSession };
