const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Load saved session (if you have session.json)
  const session = JSON.parse(fs.readFileSync('session.json', 'utf-8'));
  await page.setCookie(...session.cookies);

  await page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' });

  // Restore localStorage
  await page.evaluate(storage => {
    for (const [key, value] of Object.entries(storage)) {
      localStorage.setItem(key, value);
    }
  }, session.localStorage);

  // Inject API call from within the browser
  const response = await page.evaluate(async () => {
    const res = await fetch('https://shopee.vn/api/v4/shop/get_shop_detail?username=tenshop', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-csrftoken': document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1],
      },
      credentials: 'include'
    });
    return await res.json();
  });

  console.log('✅ API Result:', response);
  await browser.close();
})();
