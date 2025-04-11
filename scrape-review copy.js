const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const productLinks = JSON.parse(fs.readFileSync('products.json', 'utf-8'));
const reviewsPath = path.resolve('reviews.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const smoothScrollToBottom = async (page, step = 300, delayMs = 500) => {
  await page.evaluate(async (step, delayMs) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const scrollHeight = document.body.scrollHeight;
    let current = 0;
    while (current < scrollHeight) {
      window.scrollBy(0, step);
      current += step;
      await delay(delayMs);
    }
  }, step, delayMs);
};

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null,
  });

  const page = await browser.newPage();
  const allReviews = fs.existsSync(reviewsPath)
    ? JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'))
    : [];

  const crawledUrls = new Set(allReviews.map(p => p.url));

  for (const [index, url] of productLinks.entries()) {
    if (crawledUrls.has(url)) {
      console.log(`✅ [${index + 1}/${productLinks.length}] Đã crawl trước đó, bỏ qua: ${url}`);
      continue;
    }

    console.log(`🔎 [${index + 1}/${productLinks.length}] Crawling: ${url}`);
    const productReviews = [];
    let reviewPage = 1;
    let prevUsers = [];

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      const tabList = await page.$$('.product-tab__tab');
      for (const tab of tabList) {
        const tabText = await page.evaluate(el => el.innerText.trim(), tab);
        if (tabText.includes('ĐÁNH GIÁ')) {
          await tab.click();
          await delay(1500);
          break;
        }
      }

      while (true) {
        console.log(`   📄 Review page ${reviewPage}`);

        try {
          await page.waitForSelector('.shopee-product-rating', { timeout: 10000 });
        } catch {
          console.warn('   ⚠️ Không thấy review nào trên trang này.');
          break;
        }

        if (reviewPage === 1) {
          await smoothScrollToBottom(page, 300, 500);
        }

        const reviews = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.shopee-product-rating')).map(r => ({
            user: r.querySelector('.shopee-product-rating__author-name')?.innerText.trim() || '',
            rating: r.querySelectorAll('.icon-rating-solid').length,
            comment: (
              r.querySelector('.shopee-product-rating__text')?.innerText.trim() ||
              r.querySelector('.shopee-product-rating__content')?.innerText.trim() ||
              ''
            ),
            time: r.querySelector('.shopee-product-rating__time')?.innerText || ''
          }));
        });

        console.log(`   → Thu được ${reviews.length} đánh giá`);
        productReviews.push(...reviews);

        allReviews.push({ url, reviews: [...productReviews] });
        fs.writeFileSync(reviewsPath, JSON.stringify(allReviews, null, 2), 'utf-8');
        allReviews.pop();

        const currUsers = reviews.slice(0, 2).map(r => r.user.toLowerCase());

        if (reviews.length < 6) {
          console.log('   ✅ Trang có < 6 review → trang cuối.');
          break;
        }

        if (
          prevUsers.length === 2 &&
          currUsers.length === 2 &&
          prevUsers[0] === currUsers[0] &&
          prevUsers[1] === currUsers[1]
        ) {
          console.log('   🔁 2 review đầu bị trùng với trang trước → trang cuối.');
          break;
        }

        prevUsers = currUsers;

        const nextBtn = await page.$('.shopee-icon-button.shopee-icon-button--right');
        if (!nextBtn) {
          console.log('   ✅ Không tìm thấy nút tiếp theo.');
          break;
        }

        await Promise.all([
          nextBtn.click(),
          delay(1500)
        ]);

        reviewPage++;
      }

      allReviews.push({ url, reviews: productReviews });
      fs.writeFileSync(reviewsPath, JSON.stringify(allReviews, null, 2), 'utf-8');
      console.log(`✅ Đã lưu ${productReviews.length} review cho sản phẩm.`);

    } catch (err) {
      console.warn(`❌ Lỗi khi crawl ${url}: ${err.message}`);
    }

    await delay(1000);
  }

  console.log(`🎉 HOÀN TẤT: Đã crawl ${allReviews.length} sản phẩm và lưu vào reviews.json`);
})();
