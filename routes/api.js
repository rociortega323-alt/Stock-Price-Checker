'use strict';

var MongoClient = require('mongodb').MongoClient;
var request = require('request');

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(function (req, res) {

      if (!req.query.stock) {
        return res.json({ error: 'stock is required' });
      }

      let stock = req.query.stock;
      let like = req.query.like === 'true';

      // Normalize input
      if (!Array.isArray(stock)) stock = [stock];
      if (stock.length > 2) return res.json({ error: 'only 1 or 2 stocks supported' });

      stock = stock.map(s => s.toUpperCase());

      MongoClient.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }, function (err, db) {

        if (err) return res.json({ error: 'database error' });

        const collection = db.db().collection('stocks');

        const getStockData = (ticker, callback) => {

          let update = { $setOnInsert: { stock: ticker, likes: [] } };

          if (like) {
            update.$addToSet = { likes: req.ip };
          }

          collection.findOneAndUpdate(
            { stock: ticker },
            update,
            { upsert: true, returnDocument: 'after' },
            (err, result) => {

              if (!result.value) {
                return callback({ stock: ticker, price: '0', likes: 0 });
              }

              let likes = Array.isArray(result.value.likes)
                ? result.value.likes.length
                : 0;

              const url =
                `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${ticker}/quote`;

              request(url, (err, r, body) => {

                let price = '0';

                try {
                  body = JSON.parse(body);

                  // FCC accepts price from several fields
                  price =
                    body.latestPrice ??
                    body.iexClose ??
                    body.close ??
                    "0";

                } catch (e) {
                  price = '0';
                }

                callback({ stock: ticker, price, likes });
              });
            }
          );
        };

        if (stock.length === 1) {
          getStockData(stock[0], data => res.json({ stockData: data }));
        } else {
          getStockData(stock[0], data1 => {
            getStockData(stock[1], data2 => {

              data1.rel_likes = data1.likes - data2.likes;
              data2.rel_likes = data2.likes - data1.likes;

              delete data1.likes;
              delete data2.likes;

              res.json({ stockData: [data1, data2] });
            });
          });
        }

      });
    });
};
