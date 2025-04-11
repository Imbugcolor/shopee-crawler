const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function loadSession(page) {
  const session = JSON.parse(fs.readFileSync('session.json', 'utf-8'));
  await page.setCookie(...session.cookies);

  await page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' });

  await page.evaluate(localStorageData => {
    for (const [key, value] of Object.entries(localStorageData)) {
      localStorage.setItem(key, value);
    }
  }, session.localStorage);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await loadSession(page);

  const shopUrl = 'https://shopee.vn/julido1'; // change this
  await page.goto(shopUrl, { waitUntil: 'networkidle2' });

  const currentUrl = page.url();
  if (currentUrl.includes('/verify/captcha')) {
    console.log('🚫 Blocked by anti-bot captcha');
    await browser.close();
    return;
  }

  // Scroll and scrape
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(res => setTimeout(res, 1200));
  }

  const productLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.shop-search-result-view__item a'))
      .map(a => a.href)
      .filter(Boolean);
  });

  fs.writeFileSync('products.json', JSON.stringify(productLinks, null, 2));
  console.log(`✅ Found ${productLinks.length} products`);
  await browser.close();
})();
