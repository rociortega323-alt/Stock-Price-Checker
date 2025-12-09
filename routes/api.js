'use strict';

const MongoClient = require('mongodb').MongoClient;
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

module.exports = function (app) {

  function anonymizeIp(ip) {
    if (!ip) return null;
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  async function fetchStockPrice(ticker) {
    try {
      const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${ticker}/quote`;
      const res = await fetch(url, { timeout: 5000 });
      const data = await res.json();

      if (!data || !data.latestPrice) return null;

      return Number(data.latestPrice);
    } catch (err) {
      return null;
    }
  }

  app.route('/api/stock-prices')
    .get(async function (req, res) {

      if (!req.query.stock) {
        return res.json({ error: 'stock is required' });
      }

      let stock = req.query.stock;
      const like = req.query.like === 'true';

      if (!Array.isArray(stock)) stock = [stock];
      if (stock.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

      stock = stock.map(s => ('' + s).toUpperCase());
      const hashedIp = anonymizeIp(req.ip);

      MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true }, async function (err, client) {
        if (err || !client) return res.json({ error: 'database error' });

        const db = client.db();
        const collection = db.collection('stocks');

        const getStock = async (ticker) => {
          const update = { $setOnInsert: { stock: ticker, likes: [] } };

          if (like && hashedIp) {
            update.$addToSet = { likes: hashedIp };
          }

          const result = await collection.findOneAndUpdate(
            { stock: ticker },
            update,
            { upsert: true, returnDocument: 'after' }
          );

          const doc = result.value || { stock: ticker, likes: [] };
          const likes = Array.isArray(doc.likes) ? doc.likes.length : 0;

          const price = await fetchStockPrice(ticker);

          return {
            stock: ticker,
            price: price || 0,
            likes: likes
          };
        };

        if (stock.length === 1) {
          const data = await getStock(stock[0]);
          client.close();
          return res.json({ stockData: data });
        } else {
          const data1 = await getStock(stock[0]);
          const data2 = await getStock(stock[1]);

          const rel1 = data1.likes - data2.likes;
          const rel2 = data2.likes - data1.likes;

          const out = [
            { stock: data1.stock, price: data1.price, rel_likes: rel1 },
            { stock: data2.stock, price: data2.price, rel_likes: rel2 }
          ];

          client.close();
          return res.json({ stockData: out });
        }
      });

    });
};
