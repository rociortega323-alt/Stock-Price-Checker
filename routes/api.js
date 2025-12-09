'use strict';

const MongoClient = require('mongodb').MongoClient;
const request = require('request');
const crypto = require('crypto');

module.exports = function (app) {

  function anonymizeIp(ip) {
    if (!ip) return null;
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  app.route('/api/stock-prices')
    .get(function (req, res) {

      if (!req.query.stock) {
        return res.json({ error: 'stock is required' });
      }

      let stock = req.query.stock;
      const like = req.query.like === 'true';

      // Normalize input
      if (!Array.isArray(stock)) stock = [stock];
      if (stock.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

      stock = stock.map(s => ('' + s).toUpperCase());

      const hashedIp = anonymizeIp(req.ip || req.connection?.remoteAddress);

      MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true }, function (err, client) {
        if (err || !client) return res.json({ error: 'database error' });

        const db = client.db();
        const collection = db.collection('stocks');

        const getStockData = (ticker, cb) => {
          // ensure likes array exists on insert
          const update = { $setOnInsert: { stock: ticker, likes: [] } };
          if (like && hashedIp) update.$addToSet = { likes: hashedIp };

          collection.findOneAndUpdate(
            { stock: ticker },
            update,
            { upsert: true, returnDocument: 'after' }, // 'after' for modern driver
            (err, result) => {
              if (err) {
                // close client and callback with error
                return cb({ error: 'db error' });
              }

              const doc = result && result.value ? result.value : { stock: ticker, likes: [] };
              const likes = Array.isArray(doc.likes) ? doc.likes.length : 0;

              const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${ticker}/quote`;

              request(url, { timeout: 5000 }, (errReq, resp, body) => {
                // Default numeric price
                let priceNum = 0;
                try {
                  const data = JSON.parse(body);
                  const rawPrice = data.latestPrice ?? data.iexClose ?? data.close ?? data.price ?? 0;
                  priceNum = (rawPrice === null) ? 0 : Number.parseFloat(rawPrice) || 0;
                } catch (e) {
                  priceNum = 0;
                }
                cb({ stock: ticker, price: priceNum, likes: likes });
              });
            }
          );
        };

        if (stock.length === 1) {
          getStockData(stock[0], (data) => {
            client.close();
            return res.json({ stockData: data });
          });
        } else {
          // parallelize both requests for speed (but keep simple callback chain)
          getStockData(stock[0], (data1) => {
            getStockData(stock[1], (data2) => {
              // compute rel_likes as numbers
              const rel1 = (data1.likes || 0) - (data2.likes || 0);
              const rel2 = (data2.likes || 0) - (data1.likes || 0);

              // prepare returned objects
              const out1 = { stock: data1.stock, price: data1.price, rel_likes: rel1 };
              const out2 = { stock: data2.stock, price: data2.price, rel_likes: rel2 };

              client.close();
              return res.json({ stockData: [out1, out2] });
            });
          });
        }

      });
    });
};
