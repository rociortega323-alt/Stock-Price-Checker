'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const apiRoutes = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner');

const app = express();

// ---------- STATIC ----------
app.use('/public', express.static(process.cwd() + '/public'));

// ---------- CORS ----------
app.use(cors());

// ---------- BODY PARSING ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- SECURITY: Helmet + CSP ----------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],   // necesario para FCC logo
        connectSrc: ["'self'"],        // evita llamadas externas no deseadas
        objectSrc: ["'none'"],
      },
    },
  })
);

// ---------- FCC: Detect IP correctly ----------
app.enable('trust proxy'); 

// ---------- FRONTEND ----------
app.route('/')
  .get((req, res) => {
    res.sendFile(process.cwd() + '/views/index.html');
  });

// ---------- FCC TESTING ----------
fccTestingRoutes(app);

// Needed so freeCodeCamp tests detect server is alive
app.use('/_api', (req, res) => {
  res.json({ status: 'FCC API OK' });
});

// ---------- PROJECT API ----------
apiRoutes(app);

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  res.status(404).type('text').send('Not Found');
});

// ---------- SERVER ----------
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Listening on port ' + listener.address().port);

  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(() => {
      try {
        runner.run();
      } catch (e) {
        console.log('Tests are not valid:');
        console.log(e);
      }
    }, 3500);
  }
});

module.exports = app;
