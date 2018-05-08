var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');

var moods = require('./moods');
var users = require('./users');

function checkPassword(password) {
  return new Promise(resolve => {
    let passwordRegExp = /^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))/g;
    if (!passwordRegExp.test(password)) {
      throw 'Wrong password'; // We can already conclude that it's a wrong password, cause it couldn't be registered with it.
    }
    resolve(true);
  });
}

function checkUserData(username, password, email) {
  return new Promise(resolve => {
    let errors = [];

    // check email
    let emailRegEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!emailRegEx.test(email)) {
      errors.push('Email adress is invalid.');
    }

    // simple password check
    if (password.length < 8 || password.length > 128) {
      errors.push(`Minimum password length is 8 characters, maximum is 128.`);
    }
    let passwordRegExp = /^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))/g;
    if (!passwordRegExp.test(password)) {

      errors.push(`Password must be least one lowercase letter and one number or one lowecase letter and uppercase letter`);
    }

    // username check
    let noSpecialCharsRegExp = /\`|\~|\!|\@|\#|\$|\%|\^|\&|\*|\(|\)|\+|\=|\[|\{|\]|\}|\||\\|\'|\<|\,|\>|\?|\/|\""|\;|\:|\s/g;
    if (noSpecialCharsRegExp.test(username)) {
      errors.push(`Only letters, numbers, '-', '.', and '_' may be used for the username.`);
    }
    if (username.length < 5 || username.length > 35) {
      errors.push(`Username must be a minimum of 5 characters and a maximum 32 characters.`);
    }

    // return result
    if (errors.length > 0) {
      throw errors;
    }
    resolve(true);
  });
}
/* POST register. */
router.post('/register', async function (req, res, next) {
  // check validity of username, password, email
  try {
    await checkUserData(req.body.username.toLowerCase().trim(), req.body.password.trim(), req.body.email);
  } catch (e) {
    let response = {
      status: 400,
      errors: e,
      message: "Bad user input."
    };

    return res.status(400).send(response);
  }

  bcrypt.hash(req.body.password.trim(), 10, function (err, hash) {
    if (err) next(err);
    // check if such an username already exists
    r.table('users').filter({
      username: req.body.username.toLowerCase()
    }).count().gt(0).run(req._dbconn, function (err, user) {
      if (err) next(err);

      if (user === false) { // if user doesnt exists

        const user = {
          username: req.body.username.toLowerCase().trim(),
          password: hash,
          email: req.body.email,
          dateCreated: Date.now()
        };

        // create user
        r.table('users').insert(user).run(req._dbconn, function (err, result) {
          if (err) next(err);
          let jsonResponse = {
            status: 201,
            message: "Registered."
          };
          return res.status(201).send(jsonResponse);
        });

      } else {
        // send an error
        let jsonResponse = {
          status: 400,
          message: "User with such a username exists."
        };

        return res.status(400).send(jsonResponse);
      }
    })

  });
});
/* POST login */
router.post('/login', async function (req, res, next) {

  try {
    await checkPassword(req.body.password);
  } catch (e) {
    let response = {
      status: 400,
      message: e
    };

    return res.status(400).send(response);
  }

  // check if user with such an username exists
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
            return res.status(201).json(jsonResponse);
          } else {
            // Incorrect pass
            let jsonResponse = {
              status: 401,
              data: null,
              message: "Wrong password"
            };

            return res.status(401).json(jsonResponse);
          }
        });

      } else {
        // send error
        let jsonResponse = {
          status: 400,
          data: null,
          message: "User with such an username doesn't exist"
        };
        return res.status(400).json(jsonResponse);
      }
    });

  });
});

/* /user ROUTES */
router.use('/user', TokenValidator, users);
/* /moods ROUTES */
router.use('/mood', TokenValidator, moods)


module.exports = router;