const puppeteer = require("puppeteer-core");
const fs = require("fs");
const shopName = require("./shop");
const sortBySold = require("./sort");

(async () => {
  const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
  });

  const page = await browser.newPage();
  const shopUrl = `https://shopee.vn/${shopName}`; // 👈 Đổi shop tại đây
  await page.goto(shopUrl, { waitUntil: "domcontentloaded" });

  const allProducts = [];
  const seenLinks = new Set();
  let pageNumber = 1;

  while (true) {
    console.log(`📄 Đang xử lý trang ${pageNumber}...`);

    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await page.waitForSelector(".shop-search-result-view__item", {
        timeout: 15000,
      });

      const products = await page.evaluate(() => {
        const formatSold = (text) => {
          if (!text) return 0;
          if (text.includes("k"))
            return Math.round(parseFloat(text.replace(",", ".")) * 1000);
          return parseInt(text.replace(/[^\d]/g, "")) || 0;
        };

        return Array.from(
          document.querySelectorAll(".shop-search-result-view__item")
        ).map((item) => {
          const anchor = item.querySelector('a[href*="-i."]');
          const link = anchor?.href || "";

          const rawText = item.innerText.trim();
          const lines = rawText.split("\n");
          const name = lines[0]; // Dòng đầu tiên là tên sản phẩm

          const match = rawText.match(/Đã bán\s+([\d.,kK]+)/i);
          const soldRaw = match ? match[1] : "";
          const sold = formatSold(soldRaw);

          return { name, sold, link };
        });
      });

      const newProducts = products.filter(
        (p) => p.link && !seenLinks.has(p.link)
      );
      newProducts.forEach((p) => seenLinks.add(p.link));
      allProducts.push(...newProducts);

      console.log(
        `→ Tìm thấy ${newProducts.length} sản phẩm mới ở trang ${pageNumber}`
      );

      fs.writeFileSync(
        `${shopName}.json`,
        JSON.stringify(allProducts, null, 2),
        "utf-8"
      );
      console.log(`💾 Đã lưu tổng cộng ${allProducts.length} sản phẩm`);
    } catch (err) {
      console.warn(`⚠️ Không thấy sản phẩm ở trang ${pageNumber}`);
    }

    // Kiểm tra nút tiếp theo
    const nextButton = await page.$(
      "button.shopee-icon-button.shopee-icon-button--right:not([disabled])"
    );

    if (!nextButton) {
      console.log("✅ Không còn trang tiếp theo. Kết thúc.");
      break;
    }

    await Promise.all([
      nextButton.click(),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    pageNumber++;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(
    `🎉 HOÀN TẤT: Đã lưu ${allProducts.length} sản phẩm vào products.json`
  );
})();
