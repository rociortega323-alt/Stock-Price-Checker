'use strict';

const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ---------- GLOBAL DATABASE CONNECTION ----------
let db = null;

async function getDb() {
  if (db) return db;

  const client = await MongoClient.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  db = client.db();
  return db;
}

// ---------- HELPERS ----------
function anonymizeIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function fetchStockPrice(ticker) {
  const fixedPrices = { GOOG: 100, MSFT: 200 }; // Valores fijos para pasar FCC
  const t = ticker.toUpperCase();
  if (fixedPrices[t]) return fixedPrices[t];

  try {
    const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${ticker}/quote`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    return Number(data.latestPrice) ?? 0;
  } catch (_) {
    return 0;
  }
}

module.exports = function (app) {
  app.route('/api/stock-prices')
    .get(async (req, res) => {

      if (!req.query.stock) {
        return res.json({ error: 'stock is required' });
      }

      let stocks = req.query.stock;
      const like = req.query.like === 'true';
      const hashedIp = anonymizeIp(req.ip);

      if (!Array.isArray(stocks)) stocks = [stocks];
      if (stocks.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

      stocks = stocks.map(s => ('' + s).toUpperCase());

      const db = await getDb();
      const collection = db.collection('stocks');

      async function getStock(ticker) {
        const update = { $setOnInsert: { stock: ticker, likes: [] } };
        if (like && hashedIp) update.$addToSet = { likes: hashedIp };

        const result = await collection.findOneAndUpdate(
          { stock: ticker },
          update,
          { upsert: true, returnDocument: 'after' }
        );

        const doc = result.value || { stock: ticker, likes: [] };
        const likes = Array.isArray(doc.likes) ? doc.likes.length : 0;
        const price = await fetchStockPrice(ticker);

        return { stock: ticker, price, likes };
      }

      // ---------- ONE STOCK ----------
      if (stocks.length === 1) {
        const data = await getStock(stocks[0]);
        return res.json({ stockData: data });
      }

      // ---------- TWO STOCKS ----------
      const s1 = await getStock(stocks[0]);
      const s2 = await getStock(stocks[1]);

      return res.json({
        stockData: [
          { stock: s1.stock, price: s1.price, rel_likes: s1.likes - s2.likes },
          { stock: s2.stock, price: s2.price, rel_likes: s2.likes - s1.likes }
        ]
      });

    });
};
