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

// Fetch price using Alpha Vantage
async function fetchStockPrice(ticker) {
  try {
    const urlAlpha = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${process.env.ALPHA_KEY}`;
    const res = await fetch(urlAlpha);
    const data = await res.json();
    const price = data['Global Quote']?.['05. price'];
    return Number(price) || 0;
  } catch (err) {
    console.error('Error fetching stock price:', err);
    return 0;
  }
}

module.exports = function (app) {
  app.route('/api/stock-prices')
    .get(async (req, res) => {
      if (!req.query.stock) return res.json({ error: 'stock is required' });

      let stocks = req.query.stock;
      const like = req.query.like === 'true';
      const hashedIp = anonymizeIp(req.ip);

      if (!Array.isArray(stocks)) stocks = [stocks];
      if (stocks.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

      stocks = stocks.map(s => ('' + s).toUpperCase());
      const db = await getDb();
      const collection = db.collection('stocks');

      // Get or create stock document
      async function getStock(ticker) {
        const existingDoc = await collection.findOne({ stock: ticker });

        if (existingDoc) {
          if (like && hashedIp) {
            await collection.updateOne(
              { stock: ticker },
              { $addToSet: { likes: hashedIp } }
            );
            existingDoc.likes.push(hashedIp);
          }
          const likes = Array.isArray(existingDoc.likes) ? existingDoc.likes.length : 0;
          const price = await fetchStockPrice(ticker);
          return { stock: ticker, price, likes };
        } else {
          const newDoc = { stock: ticker, likes: like && hashedIp ? [hashedIp] : [] };
          await collection.insertOne(newDoc);
          const likes = newDoc.likes.length;
          const price = await fetchStockPrice(ticker);
          return { stock: ticker, price, likes };
        }
      }

      // ---------- ONE STOCK ----------
      if (stocks.length === 1) {
        const data = await getStock(stocks[0]);
        return res.json({ stockData: data });
      }

      // ---------- TWO STOCKS ----------
      const s1 = await getStock(stocks[0]);
      const s2 = await getStock(stocks[1]);

      const relLikes1 = s1.likes - s2.likes;
      const relLikes2 = s2.likes - s1.likes;

      return res.json({
        stockData: [
          { stock: s1.stock, price: s1.price, rel_likes: relLikes1 },
          { stock: s2.stock, price: s2.price, rel_likes: relLikes2 }
        ]
      });
    });
};
