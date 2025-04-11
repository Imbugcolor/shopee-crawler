const { getShopeeRatings } = require('./shopeeGetRatings');

(async () => {
  const ratings = await getShopeeRatings({
    browserURL: 'http://localhost:9222',
    shopid: 29647358,
    itemid: 1512469642,
    limit: 50,
    maxPages: 10
  });

  console.log(`✅ Found ${ratings.length} ratings`);
  console.log(ratings[0]); // show one rating
})();
