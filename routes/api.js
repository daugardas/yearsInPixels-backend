var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');

var moods = require('./moods');
var users = require('./users');
var journals = require('./journals');

/* POST register. */
router.post('/register', function (req, res, next) {

  res.header('Access-Control-Allow-Origin', '*');
  bcrypt.hash(req.body.password, 10, function (err, hash) {
    if (err) next(err);
    // check if such an username already exists
    r.table('users').filter({
      username: req.body.username.toLowerCase()
    }).count().gt(0).run(req._dbconn, function (err, user) {
      if (err) next(err);

      if (user === false) { // if user doesnt exists

        const user = {
          username: req.body.username.toLowerCase(),
          password: hash,
          email: req.body.email,
          dateCreated: Date.now()
        };

        // create user
        r.table('users').insert(user).run(req._dbconn, function (err, result) {
          if (err) next(err);
          let jsonResponse = {
            status: 201,
            data: null,
            message: "Registered"
          };
          res.send(jsonResponse);
        });

      } else {
        // send an error
        let jsonResponse = {
          status: 500,
          data: null,
          message: "User with such a username exists"
        };

        res.status(500).send(jsonResponse);
      }
    })

  });
});
/* POST login */
router.post('/login', function (req, res, next) {
  // check if user with such an username exists
  res.header('Access-Control-Allow-Origin', '*');
  r.table('users').filter({
    username: req.body.username.toLowerCase()
  }).run(req._dbconn, function (err, cursor) {
    if (err) next(err);


    cursor.toArray(function (err, user) {
      if (err) next(err);

      if (user[0]) { // if user exists
        let hashPass = user[0].password;
        // compare passwords
        bcrypt.compare(req.body.password, hashPass, function (err, correctPass) {
          if (err) next(err);

          if (correctPass) {
            // Logged in
            userInformation = {
              dateCreated: user[0].dateCreated,
              email: user[0].email,
              id: user[0].id,
              username: user[0].username
            };
            var token = jwt.sign(userInformation, process.env.JWT_SECRET, {
              expiresIn: "1d"
            });
            let jsonResponse = {
              status: 201,
              data: userInformation,
              message: "Logged in",
              token: token
            };
            res.json(jsonResponse);
          } else {
            // Incorrect pass
            let jsonResponse = {
              status: 500,
              data: null,
              message: "Incorrect password"
            };

            res.json(jsonResponse);
          }
        });

      } else {
        // send error
        let jsonResponse = {
          status: 500,
          data: null,
          message: "User with such an username doesn't exist"
        };
        res.json(jsonResponse);
      }
    });

  });
});

/* /user ROUTES */
router.use('/user', TokenValidator, users);
/* /moods ROUTES */
router.use('/mood', TokenValidator, moods)
/* /journal ROUTES */
router.use('/journal', TokenValidator, journals);

module.exports = router;