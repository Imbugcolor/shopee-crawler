const fs = require('fs');

// Đọc dữ liệu từ products.json
const sortBySold = (fileName) => {

    const products = JSON.parse(fs.readFileSync(`${fileName}`, 'utf-8'));
    
    // Sắp xếp theo số lượng sold giảm dần
    products.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    
    // Ghi lại vào file
    fs.writeFileSync(`${fileName}`, JSON.stringify(products, null, 2), 'utf-8');
    
    console.log(`✅ Đã sắp xếp ${products.length} sản phẩm theo sold giảm dần.`);
}

module.exports = sortBySold;
