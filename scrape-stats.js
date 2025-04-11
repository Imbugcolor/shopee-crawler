const puppeteer = require('puppeteer-core');
const fs = require('fs');

// Đọc danh sách sản phẩm
const productLinks = JSON.parse(fs.readFileSync('products.json', 'utf-8'));

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null,
  });

  const page = await browser.newPage();
  const allStats = [];

  for (const [index, url] of productLinks.entries()) {
    console.log(`🔍 [${index + 1}/${productLinks.length}] Đang xử lý: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

       // ✅ Click tab "ĐÁNH GIÁ" nếu có bằng selector CSS
       const tabList = await page.$$('.product-tab__tab');
       for (const tab of tabList) {
         const tabText = await page.evaluate(el => el.innerText.trim(), tab);
         if (tabText.includes('ĐÁNH GIÁ')) {
           await tab.click();
           await new Promise(r => setTimeout(r, 1500));
           break;
         }
       }

      // ✅ Chờ phần review (nếu có)
      await page.waitForSelector('.shopee-product-rating', { timeout: 10000 });

    //   await page.waitForSelector('.product-rating-overview__quantity', { timeout: 10000 });

      // ✅ Lấy thống kê từ DOM
      const stats = await page.evaluate(() => {
        const result = {
          url: location.href,
          name: '',
          sold: 0,
          total_reviews: 0,
          ratings_count_by_star: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          comments_with_media: null,
        };

        // Tên sản phẩm
        const nameEl = document.querySelector('h1') || document.querySelector('._44qnta') || document.querySelector('.VCNVHj');
        console.log('nameEl', nameEl);
        if (nameEl) result.name = nameEl.innerText.trim();

        // Đã bán
        const soldSpan = Array.from(document.querySelectorAll('span')).find(el => /đã bán/i.test(el.innerText));
        if (soldSpan) {
          const match = soldSpan.innerText.match(/\d+/g);
          result.sold = match ? parseInt(match.join('')) : 0;
        }

        // Tổng đánh giá
        const qty = document.querySelector('.product-rating-overview__filters');
        console.log('qty', qty);
        if (qty) {
          const match = qty.innerText.match(/\d+/g);
          result.total_reviews = match ? parseInt(match.join('')) : 0;
        }

        // Theo sao
        const levels = document.querySelectorAll('.product-rating-overview__rating-level-item');
        levels.forEach(el => {
          const star = parseInt(el.querySelector('span')?.innerText) || 0;
          const count = parseInt(el.querySelector('.product-rating-overview__rating-level-item-count')?.innerText.replace(/[^\d]/g, '')) || 0;
          if (star >= 1 && star <= 5) {
            result.ratings_count_by_star[star] = count;
          }
        });

        // Có ảnh/video
        const mediaEl = document.querySelector('.product-rating-overview__filter--with-media .product-rating-overview__filter-number');
        if (mediaEl) {
          result.comments_with_media = parseInt(mediaEl.innerText.replace(/[^\d]/g, '')) || 0;
        }

        return result;
      });

      allStats.push(stats);

      // Ghi tạm
      fs.writeFileSync('review-stats-simple.json', JSON.stringify(allStats, null, 2), 'utf-8');
      console.log(`✅ ${stats.name} — ${stats.total_reviews} đánh giá, ${stats.sold} đã bán`);
    } catch (err) {
      console.warn(`❌ Lỗi với ${url}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('🎉 HOÀN TẤT: Đã lưu vào review-stats-simple.json');
})();
