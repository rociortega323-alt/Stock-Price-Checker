**freeCodeCamp** - Information Security and Quality Assurance Project
------

**Stock Price Checker**

1) SET NODE_ENV to `test` without quotes and set MONGO_URI to your Mongo connection string
2) Complete the project in `routes/api.js` or by creating a handler/controller
3) You will add any security features to `server.js`
4) You will create all of the functional tests in `tests/2_functional-tests.js`

### User Stories:

1. Set the content security policies to only allow loading of scripts and CSS from your server. (this was ignored to allow scripts so the forms below work)
2. I can **GET** `/api/stock-prices` with form data containing a Nasdaq _stock_ ticker and recieve back an object _stockData_.
3. In _stockData_, I can see the _stock_ (string, the ticker), _price_ (decimal), and _likes_ (int).
4. I can also pass along field _like_ as **true** (boolean) to have my like added to the stock(s). Only 1 like per IP address should be accepted.
5. If I pass along 2 stocks, the return object will be an array with both stock's info but instead of _likes_, it will display _rel\_likes_ (the difference between the likes on both) on both.
6. A good way to receive the current price is the following external API (replace 'goog' with the stock):\
	`https://www.alphavantage.co/query?function=global_quote&symbol=goog&apikey=YOUR_API_KEY_HERE`\
	(Get your free API key [here](https://www.alphavantage.co/support/#api-key))
7. All 5 functional tests are complete and passing.