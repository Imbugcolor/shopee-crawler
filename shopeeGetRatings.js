const puppeteer = require('puppeteer-core');

/**
 * Gọi API get_ratings trong trình duyệt để bypass các headers security.
 * @param {Object} config
 * @param {string} config.browserURL - Chrome Debugging URL (ví dụ: http://localhost:9222)
 * @param {number} config.shopid
 * @param {number} config.itemid
 * @param {number} [config.limit=50]
 * @param {number} [config.pages=2]
 */
async function getRatingsViaBrowser({ browserURL, shopid, itemid, limit = 50, pages = 2 }) {
  const browser = await puppeteer.connect({ browserURL });
  const page = await browser.newPage();

  const productUrl = `https://shopee.vn/product/${shopid}/${itemid}`;
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
  console.log('✅ Opened product page.');

  const ratings = await page.evaluate(async ({ itemid, shopid, limit, pages }) => {
    const allRatings = [];

    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      const offset = pageIndex * limit;
      const url = `https://shopee.vn/api/v2/item/get_ratings?itemid=${itemid}&shopid=${shopid}&limit=${limit}&offset=${offset}&type=0`;

      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include', // Bắt buộc để truyền cookie và kèm headers Shopee
        });

        const json = await res.json();

        if (!json?.data?.ratings?.length) break;
        allRatings.push(...json.data.ratings);

        if (allRatings.length >= json.data.item_rating.rating_count) break;
      } catch (err) {
        console.warn('⚠️ Lỗi khi gọi API:', err.message);
        break;
      }
    }

    return allRatings;
  }, { itemid, shopid, limit, pages });

  await page.close();
  await browser.disconnect();

  return ratings;
}

// Test thử với 1 sản phẩm
(async () => {
  const result = await getRatingsViaBrowser({
    browserURL: 'http://localhost:9222',
    shopid: 29647358,
    itemid: 1512469642,
    pages: 3,
  });

  console.log(`🎉 Collected ${result.length} ratings`);
  console.log(result.slice(0, 3)); // In ra 3 rating đầu tiên
})();
