var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
require('dotenv').config();
var r = require('rethinkdb'); // database
var api = require('./routes/api');

var dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  db: process.env.DB
};
var app = express();

app.set('views', path.join(__dirname, 'views')); 
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// DB connection
app.use(createConnection);

app.use('/api', api);
//close db connection
app.use(closeConnection);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;

function createConnection(req,res, next){
  r.connect(dbConfig).then(function(conn){
    // save connection in req
    req._dbconn = conn;
    next();
  }).error(function(err){
    console.log(err);
  });
}
function closeConnection(req, res, next){
  req._dbconn.close();
  next();
}