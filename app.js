var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
require('dotenv').config();
var r = require('rethinkdb'); // database
var api = require('./routes/api');
var cors = require('cors');

var app = express();

app.use(cors());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// DB connection
app.use(createConnection);
app.use('/api', api);
//close db connection
app.use(closeConnection);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});
// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.send({
    "error": err.message
  });
});
module.exports = app;

function createConnection(req, res, next) {
  r.connect({
    host: process.env.DATA_RETHINKDB_HOST,
    port: 28015
  }).then(function (conn) {
    // save connection in req
    req._dbconn = conn;

    //check if db exist
    r.dbCreate(process.env.DATA_DB).run(conn).then(function (result) {
      // database created
    }).error(function (err) {
      //database exists
    });
    const tables = ['users', 'resetPassTokens', 'moods'];
    tables.forEach(function (table) {
      r.db(process.env.DATA_DB).tableList().contains(table).run(conn).then(function (result) {
        // if table doesn't exist, create one
        if (!result) {
          r.db(process.env.DATA_DB).tableCreate(table).run(conn, function (err, result) {
            if (err) {
              console.error(err);
              return next(err);
            }
          });
        }
      }).error(function (error) {
        return next(error);
      });
    });
    next();
  }).error(function (err) {
    let connectionErr = new Error("Server malfunctioned.");
    next(connectionErr);
  });
}
function closeConnection(req, res, next) {
  req._dbconn.close();
  next();
}