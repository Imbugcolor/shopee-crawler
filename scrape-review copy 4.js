const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx"); // Import thư viện xlsx
const { google } = require("googleapis");
const axios = require("axios");

const CREDENTIALS_PATH = "./secret/credentials.json";
const SPREADSHEET_ID = "1TId4ofTyab13rj3cP0AwLbUk4MnI3-FwOvK0HMfYlTU";

const productList = JSON.parse(fs.readFileSync(`products.json`, "utf-8"));
const completedPath = path.resolve(`products-completed.json`);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const smoothScrollToBottom = async (page, step = 300, delayMs = 500) => {
  await page.evaluate(
    async (step, delayMs) => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const scrollHeight = document.body.scrollHeight;
      let current = 0;
      while (current < scrollHeight) {
        window.scrollBy(0, step);
        current += step;
        await delay(delayMs);
      }
    },
    step,
    delayMs
  );
};

const convertFields = (inputString) => {
  // Tách chuỗi theo dấu "|"
  const [time, typeDescription] = inputString.split(" | ");

  // Tách thông tin 'type' sau phần "Phân loại hàng: "
  const type = typeDescription ? typeDescription.split(":")[1].trim() : null;

  // In kết quả
  return (result = {
    time: time,
    type: type,
  });
};

function extractProductNameFromUrl(url) {
  const match = url.match(/shopee.vn\/(.*?)\-i\./);
  if (!match || !match[1]) return "";
  return decodeURIComponent(match[1].replace(/-/g, " "));
}

const completedUrls = fs.existsSync(completedPath)
  ? new Set(JSON.parse(fs.readFileSync(completedPath, "utf-8")))
  : new Set();

const randomDelay = (min, max) => delay(Math.random() * (max - min) + min);

const webhookUrl =
  "https://open-sg.larksuite.com/anycross/trigger/callback/MGY0OWZmMjMzZmQ0ZWI0NjgzMTkyZWYxODMyMzA4OWFi"; // Thay bằng webhook thật

async function uploadXlsxToSheet(filePath, sheetName) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  // Read xlsx
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], {
    header: 1,
  });

  // Get all sheets
  const sheetMeta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  const existingSheet = sheetMeta.data.sheets.find(
    (s) => s.properties.title === sheetName
  );

  // Delete sheet if exists
  if (existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId: existingSheet.properties.sheetId,
            },
          },
        ],
      },
    });
    console.log(`🗑️ Đã xóa sheet cũ: ${sheetName}`);
  }

  // Add new sheet
  const addSheetRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    },
  });

  // Ghi dữ liệu vào sheet mới
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: jsonData,
    },
  });

  return addSheetRes.data.replies[0].addSheet.properties.sheetId;
}

(async () => {
  const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
  });

  const page = await browser.newPage();

  for (const [index, product] of productList.entries()) {
    const url = product.link;
    const code = product.code;
    const XLSX_FILE_PATH = path.resolve(`${code}.xlsx`);
    const NEW_SHEET_NAME = code;
    const reviewsPath = path.resolve(`${code}.json`);

    const allReviews = fs.existsSync(reviewsPath)
    ? JSON.parse(fs.readFileSync(reviewsPath, "utf-8"))
    : [];

    if (completedUrls.has(url)) {
      console.log(
        `✅ [${index + 1}/${
          productList.length
        }] Đã hoàn tất trước đó, bỏ qua: ${url}`
      );
      continue;
    }

    console.log(`🔎 [${index + 1}/${productList.length}] Crawling: ${url}`);
    let productReviews = [];
    let reviewPage = 1;
    let prevUsers = [];
    let retries = 0;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      const tabList = await page.$$(".product-tab__tab");
      for (const tab of tabList) {
        const tabText = await page.evaluate((el) => el.innerText.trim(), tab);
        if (tabText.includes("ĐÁNH GIÁ")) {
          await tab.click();
          await delay(1500);
          break;
        }
      }

      while (true) {
        console.log(`   📄 Review page ${reviewPage}`);

        try {
          await page.waitForSelector(".shopee-product-rating", {
            timeout: 10000,
          });
        } catch {
          console.warn("   ⚠️ Không thấy review nào trên trang này.");
          break;
        }

        if (reviewPage === 1) {
          await smoothScrollToBottom(page, 300, 500);
        }

        const reviews = await page.evaluate(() => {
          return Array.from(
            document.querySelectorAll(".shopee-product-rating")
          ).map((r) => ({
            user:
              r
                .querySelector(".shopee-product-rating__author-name")
                ?.innerText.trim() || "",
            rating: r.querySelectorAll(".icon-rating-solid").length,
            time:
              r.querySelector(".shopee-product-rating__time")?.innerText || "",
          }));
        });

        console.log(`   → Thu được ${reviews.length} đánh giá`);

        let newReviews = reviews;

        // Kiểm tra các review có trùng với trang trước hay không
        const currUsers = newReviews
          .slice(0, 2)
          .map((r) => r.user.toLowerCase());

        // Nếu 2 review đầu trùng với lần trước, thử lại
        if (
          prevUsers.length === 2 &&
          currUsers.length === 2 &&
          prevUsers[0] === currUsers[0] &&
          prevUsers[1] === currUsers[1]
        ) {
          console.log(
            `   🔁 2 review đầu bị trùng với trang trước → retry lần thứ ${
              retries + 1
            }`
          );
          if (retries >= 3) {
            console.log("   ❌ Sau 3 lần thử, bỏ qua.");
            break;
          }

          retries++;
          continue; // Skip current loop iteration and retry
        }

        prevUsers = currUsers;

        // Lưu những review không bị trùng vào mảng
        productReviews.push(...newReviews);

        const nextBtn = await page.$(
          ".shopee-icon-button.shopee-icon-button--right"
        );
        if (!nextBtn) {
          console.log("   ✅ Không tìm thấy nút tiếp theo.");
          break;
        }

        await Promise.all([nextBtn.click(), randomDelay(1500, 3000)]);

        reviewPage++;
      }

      allReviews.push({ ...product, reviews: productReviews });
      fs.writeFileSync(
        reviewsPath,
        JSON.stringify(allReviews, null, 2),
        "utf-8"
      );

      completedUrls.add(url);
      fs.writeFileSync(
        completedPath,
        JSON.stringify([...completedUrls], null, 2),
        "utf-8"
      );

      // Chuyển đổi JSON thành XLSX
      const workbook = xlsx.utils.book_new();
      const sheetData = allReviews.flatMap((product) =>
        product.reviews.map((review) => ({
          productLink: product.link,
          productName: extractProductNameFromUrl(product.link),
          user: review.user,
          rating: review.rating,
          time: convertFields(review.time).time,
          type: convertFields(review.time).type,
        }))
      );

      const worksheet = xlsx.utils.json_to_sheet(sheetData);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Reviews");

      // Lưu file XLSX
      const xlsxPath = `${code}.xlsx`;
      xlsx.writeFile(workbook, xlsxPath);

      console.log(`🎉 Đã xuất dữ liệu thành công vào file: ${xlsxPath}`);

      // Upload file XLSX lên Google Sheets
      const newSheetId = await uploadXlsxToSheet(XLSX_FILE_PATH, NEW_SHEET_NAME);
      // Gửi sheetId sau khi tạo thành công
      await axios.post(webhookUrl, {
        sheetId: newSheetId,
        sheetName: NEW_SHEET_NAME,
        spreadsheetId: SPREADSHEET_ID,
      });

      // Xóa file JSON tạm
      try {
        fs.unlinkSync(reviewsPath);
        fs.unlinkSync(XLSX_FILE_PATH);
        console.log(`🗑️ Đã xóa file tạm`);
      } catch (err) {
        console.warn(`❌ Không thể xóa file`, err);
      }

      console.log(`✅ Đã lưu ${productReviews.length} review cho sản phẩm.`);
    } catch (err) {
      console.warn(`❌ Lỗi khi crawl ${url}: ${err.message}`);
    } finally {
      // Đóng tab chỉ khi còn ít nhất 2 tab
      const pages = await browser.pages();
      if (pages.length > 1) {
        console.log("   🚪 Đóng tab sau khi crawl xong...");
        await page.close();
      } else {
        console.log("   🚪 Không đóng tab vì chỉ còn 1 tab mở.");
      }
    }

    await delay(1000);
  }
})();
