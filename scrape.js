const puppeteer = require("puppeteer-core");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
  });

  const page = await browser.newPage();
  const shopUrl = "https://shopee.vn/luluumalll"; // 👈 Đổi shop tại đây
  await page.goto(shopUrl, { waitUntil: "domcontentloaded" });

  const allLinks = new Set();
  let pageNumber = 1;

  while (true) {
    console.log(`📄 Đang xử lý trang ${pageNumber}...`);

    // Scroll nhẹ để render sản phẩm
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      // Đợi sản phẩm xuất hiện (selector chuẩn mới)
      await page.waitForSelector(".shop-search-result-view__item", {
        timeout: 15000,
      });

      // Lấy link sản phẩm
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="-i."]')).map(
          (a) => a.href
        );
      });

      links.forEach((link) => allLinks.add(link));
      console.log(`→ Tìm thấy ${links.length} sản phẩm ở trang ${pageNumber}`);

      // 📝 Save after each page
      const productArray = Array.from(allLinks);
      fs.writeFileSync(
        "products.json",
        JSON.stringify(productArray, null, 2),
        "utf-8"
      );
      console.log(
        `💾 Đã cập nhật products.json với ${productArray.length} sản phẩm`
      );
    } catch (err) {
      console.warn(`⚠️ Không thấy sản phẩm ở trang ${pageNumber}`);
    }

    // Kiểm tra nút "Trang sau"
    const nextButton = await page.$(
      "button.shopee-icon-button.shopee-icon-button--right:not([disabled])"
    );
    const isDisabled = await page.evaluate((btn) => btn.disabled, nextButton);
    if (isDisabled) {
      console.log("✅ Reached last page.");
      break;
    }

    // Click trang sau
    await Promise.all([
      nextButton.click(),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    ]);

    pageNumber++;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // // Ghi ra file
  // const productArray = Array.from(allLinks);
  // fs.writeFileSync(
  //   "products.json",
  //   JSON.stringify(productArray, null, 2),
  //   "utf-8"
  // );
  // console.log(`🎉 Đã lưu ${productArray.length} sản phẩm vào products.json`);
})();
