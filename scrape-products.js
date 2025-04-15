const puppeteer = require("puppeteer-core");
const fs = require("fs");
const shopName = require("./shop");
const { exec } = require("child_process");

(async () => {
  const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
  });
  try {
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

      let navigationFailed = false;
      await Promise.all([
        nextButton.click(),
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ]).catch((err) => {
        navigationFailed = true;
      });

      if (navigationFailed) {
        // Đóng tab chỉ khi còn ít nhất 2 tab
        const pages = await browser.pages();
        if (pages.length > 1) {
          console.log("   🚪 Đóng tab sau khi crawl xong...");
          await page.close();
        } else {
          console.log("   🚪 Không đóng tab vì chỉ còn 1 tab mở.");
        }
        break;
      }

      pageNumber++;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // Sắp xếp lại mảng theo sold giảm dần
    allProducts.sort((a, b) => b.sold - a.sold);
    fs.writeFileSync(
      `${shopName}.json`,
      JSON.stringify(allProducts, null, 2),
      "utf-8"
    );

    console.log(
      `🎉 HOÀN TẤT: Đã lưu ${allProducts.length} sản phẩm vào products.json`
    );

    // 👉 Tự động gọi file scrape-review.js
    console.log("🚀 Đang gọi script scrape-review.js...");
    exec("node scrape-review.js", (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Lỗi khi chạy scrape-review.js: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`⚠️ STDERR: ${stderr}`);
        return;
      }
      console.log(`📥 OUTPUT:\n${stdout}`);
    });
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    return;
  } finally {
    // Đảm bảo đóng trình duyệt khi hoàn tất hoặc có lỗi
    const pages = await browser.pages();
    if (pages.length > 1) {
      console.log("🚪 Đóng tab sau khi crawl xong...");
      await pages[0].close();
    } else {
      console.log("🚪 Không đóng tab vì chỉ còn 1 tab mở.");
    }
  }
})();
