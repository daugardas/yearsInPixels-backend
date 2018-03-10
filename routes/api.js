var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var r = require('rethinkdb'); // database
/* POST register. */
router.post('/register', function (req, res, next) {

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
          res.status(201).send("Succesufully registered");
        });

      } else {
        // send an error
        res.status(500).send("User already exists");
      }
    })

  });
});
/* POST login */
router.post('/login', function (req, res, next) {
  // check if user with such an username exists
  r.table('users').filter({
    username: req.body.username.toLowerCase()
  }).run(req._dbconn, function (err, cursor) {
    if (err) next(err);

    if (cursor) { // if user exists
      cursor.toArray(function (err, user) {
        if (err) next(err);
        let hashPass = user[0].password;
        // compare passwords
        bcrypt.compare(req.body.password, hashPass, function (err, correctPass) {
          if (err) next(err);

          if (correctPass) {
            // Logged in
            res.status(201).send("Succesfully logged in");
          } else {
            // Incorrect pass
            res.status(500).send("Incorrect password");
          }
        })
      });
    } else {
      // send error
      res.status(500).send("User with such an username doesn't exist");
    }
  });
});

module.exports = router;