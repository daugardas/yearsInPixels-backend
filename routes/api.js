var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');
var nodemailer = require('nodemailer');
var moods = require('./moods');
var users = require('./users');
var request = require('request');

let transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    type: 'OAuth2',
    user: "yearsinpixels@gmail.com",
    clientId: process.env.AUTH_CLIENT_ID,
    clientSecret: process.env.AUTH_CLIENT_SECRET,
    refreshToken: process.env.AUTH_REFRESH_TOKEN
  }
});
function internalServerErrorResponse(res, message) {
  let jsonResponse = {
    message: message
  };
  res.status(500).json(jsonResponse);
}
function sendResetPass(username, email, resetLink) {
  new Promise(resolve => {
    let htmlEmail = `
    <style>
      * {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
      }
      .container {
        display: block;
        margin: 20px 0 0 20px;
      }
      .username {
        margin-bottom: 10px;
      }
      p {
        margin: 10px 0;
      }
    </style>  
    <div class="container">
      <h3 class="username">Hello, ${username}</h3>
      <p>We received a request from your account to change your password. If this was your request, click the link below to reset your password.</p>
      <a href="${resetLink}">Reset My Password</a>
      <p>If you did not forgot your password, you can safely ignore this email.</p>
    </div>
    `;
    let mailOptions = {
      to: email,
      subject: "Reset your password",
      html: htmlEmail
    };
    transporter.sendMail(mailOptions, function (error, response) {
      if (error) {
        throw error;
      } else {
        resolve(response);
      }
    });
  });
}
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
function generateResetLink(uID, date, req, res) {
  return new Promise(resolve => {
    let token = jwt.sign({
      id: uID,
      date: date
    }, process.env.JWT_SECRET);
    let link = `https://yearsinpixels.com/reset/${token}`;
    r.db(process.env.DATA_DB).table('resetPassTokens').filter({
      userID: uID
    }).run(req._dbconn, function (err, cursor) {
      if (err) {
        console.error(err);
        throw "Error while filtering database";
      }

      cursor.toArray(function (err, rows) {
        if (err) {
          console.error(err);
          throw "Error while cursoring database response";
        }
        if (!rows[0]) {
          r.db(process.env.DATA_DB).table('resetPassTokens').insert({
            token: token,
            userID: uID
          }).run(req._dbconn, function (err, res) {
            if (err) {
              console.error(err);
              throw "Error while inserting token to database";
            }
            return resolve(link);
          });
        } else {
          return resolve(`https://yearsinpixels.com/reset/${rows[0].token}`)
        }
      });
    });
  });
}
function verifyRecaptcha(response) {
  return new Promise(resolve => {
    let URL = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${response}`;
    request(URL, function (error, response, body) {
      body = JSON.parse(body);
      if (error) {
        throw error;
      }
      resolve(body);
    });
  });
}
router.post('/register', async function (req, res, next) {
  // verify recaptcha
  try {
    let verify = await verifyRecaptcha(req.body.recaptchaResponse);
    if (!verify.success) {
      let response = {
        error: `Please refresh this page, and verify captcha again.`
      };
      return res.status(429).json(response);
    }
  } catch (e) {
    console.error(e);
    let response = {
      error: `Couldn't verify recaptcha.`
    };
    return res.status(500).json(response);
  }
  try {
    await checkUserData(req.body.username.toLowerCase().trim(), req.body.password.trim(), req.body.email.trim());
  } catch (e) {
    let response = {
      errors: e,
      message: "Bad user input."
    };
    return res.status(400).send(response);
  }
  bcrypt.hash(req.body.password.trim(), 10, function (err, hash) {
    if (err) next(err);
    // check if such an username already exists
    r.db(process.env.DATA_DB).table('users').filter({
      username: req.body.username.trim().toLowerCase()
    }).count().gt(0).run(req._dbconn, function (err, user) {
      if (err) next(err);
      if (user === false) { // if user doesnt exists
        // check if email taken
        r.db(process.env.DATA_DB).table('users').filter({
          email: req.body.email.trim()
        }).count().gt(0).run(req._dbconn, function (err, userEmail) {
          if (err) next(err);
          if (userEmail === false) { // if user doesnt exists
            const user = {
              username: req.body.username.toLowerCase().trim(),
              password: hash,
              email: req.body.email.trim(),
              dateCreated: Date.now(),
              moods: [{"moodName": "Excited","moodColor": "#CC29CC","moodID": "1"},{"moodName": "Happy","moodColor": "#FFFF00","moodID": "2"},{"moodName": "Normal","moodColor": "#00FBFF","moodID": "3"},{"moodName": "Nervous","moodColor": "#00FF00","moodID": "4"},{"moodName": "Sad","moodColor": "#008CFF","moodID": "5"},{"moodName": "Exhausted","moodColor": "#FF9100","moodID": "6"},{"moodName": "Bored", "moodColor": "#A3A3A3", "moodID": "7" }, {"moodName": "Angry", "moodColor": "#FF5B87", "moodID": "8"}]
            };
            // create user
            r.db(process.env.DATA_DB).table('users').insert(user).run(req._dbconn, function (err, result) {
              if (err) next(err);
              let jsonResponse = {
                message: "Registered."
              };
              return res.status(201).send(jsonResponse);
            });
          } else {
            // send an error
            let jsonResponse = {
              message: "User with such an email exists."
            };
            return res.status(400).send(jsonResponse);
          }
        });
      } else {
        // send an error
        let jsonResponse = {
          message: "User with such a username exists."
        };
        return res.status(400).send(jsonResponse);
      }
    })
  });
});
router.post('/login', async function (req, res, next) {
  try {
    await checkPassword(req.body.password);
  } catch (e) {
    let response = {
      message: e
    };
    return res.status(400).send(response);
  }
  // check if user with such an username exists
  r.db(process.env.DATA_DB).table('users').filter({
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
              username: user[0].username,
              moods: user[0].moods,
            };
            var token = jwt.sign({id : user[0].id}, process.env.JWT_SECRET, {
              expiresIn: "1d"
            });
            let jsonResponse = {
              data: userInformation,
              message: "Logged in.",
              token: token
            };
            return res.status(200).json(jsonResponse);
          } else {
            // Incorrect pass
            let jsonResponse = {
              message: "Wrong password"
            };
            return res.status(401).json(jsonResponse);
          }
        });
      } else {
        // send error
        let jsonResponse = {
          message: "User with such an username doesn't exist"
        };
        return res.status(400).json(jsonResponse);
      }
    });
  });
});
router.post('/forgot', function (req, res, next) {
  // check if user wants to remember by username or password
  if (req.body.username) {
    // check if user with such an username exists
    r.db(process.env.DATA_DB).table('users').filter({
      username: req.body.username.trim().toLowerCase()
    }).run(req._dbconn, function (err, cursor) {
      if (err) next(err);
      cursor.toArray(async function (err, user) {
        if (err) next(err);
        if (user[0]) { // if user exists
          try {
            let resetLink = await generateResetLink(user[0].id, Date.now(), req, res); // using date and id to create an unique token
            await sendResetPass(user[0].username, user[0].email, resetLink);
          } catch (e) {
            let response = {
              error: e
            };
            return res.status(500).json(response);
          }
          let jsonResponse = {
            message: "Sent an email with instructions to reset password."
          };
          return res.status(200).json(jsonResponse);

        } else {
          // send error
          let jsonResponse = {
            message: "User with such an username doesn't exist"
          };
          return res.status(400).json(jsonResponse);
        }
      });

    });
  } else if (req.body.email) {
    // check if user with such an email exists
    r.db(process.env.DATA_DB).table('users').filter({
      email: req.body.email.trim()
    }).run(req._dbconn, function (err, cursor) {
      if (err) next(err);
      cursor.toArray(async function (err, user) {
        if (err) next(err);
        if (user[0]) { // if user exists
          try {
            let resetLink = await generateResetLink(user[0].id, Date.now(), req, res); // using date and id to create an unique token
            await sendResetPass(user[0].username, user[0].email, resetLink);
          } catch (e) {
            console.error(`error:`, e);
            let response = {
              error: "Sorry, server malfunctioned, couldn't send you an error :("
            };
            return res.status(500).json(response);
          }

          let jsonResponse = {
            message: "Sent an email with instructions to reset password."
          };
          return res.status(200).json(jsonResponse);

        } else {
          // send error
          let jsonResponse = {
            message: "User with such an email doesn't exist."
          };
          return res.status(200).json(jsonResponse);
        }
      });

    });
  }
});
router.get('/forgot', function (req, res, next) {
  if (req.headers.authorization) {
    const forgotToken = req.headers.authorization;
    r.db(process.env.DATA_DB).table('resetPassTokens').filter({
      token: forgotToken
    }).run(req._dbconn, function (err, cursor) {
      if (err) {
        internalServerErrorResponse(res, "Error while filtering database");
        return next(err);
      }
      cursor.toArray(function (err, rows) {
        if (err) {
          internalServerErrorResponse(res, "Error while passing cursor to array.");
          return next(err);
        }
        if (rows[0]) {
          r.db(process.env.DATA_DB).table('users').get(rows[0].userID).run(req._dbconn, function (err, result) {
            if (err) {
              internalServerErrorResponse(res, "Error while getting data about user from db");
              return next(err);
            }
            if (result) {
              let response = {
                id: result.id,
                username: result.username,
                recoverToken: forgotToken
              }
              return res.status(200).json(response);
            } else {
              internalServerErrorResponse(res, "Error while getting data about user from db");
              return next(err);
            }
          });
        } else {
          let response = {
            error: "Such a token doesn't exist."
          }
          return res.status(400).json(response);
        }
      });
    });
  } else {
    let response = {
      error: "Request doesn't have an Authorization header with forgot token value"
    };
    return res.status(400).json(response);
  }
});
router.post('/recover', function (req, res, next) {
  const userID = req.body.id.trim();
  const recoverToken = req.body.recoverToken.trim();

  // check if an user id and recover token exist in the same document
  r.db(process.env.DATA_DB).table('resetPassTokens').filter({
    userID: userID,
    token: recoverToken
  }).run(req._dbconn, function (err, cursor) {
    if (err) {
      internalServerErrorResponse(res, "Error while searching for a recover document.");
      return next(err);
    }
    cursor.toArray(async function (err, rows) {
      // if document exists
      if (rows[0]) {
        // encrypt new password
        const newPassword = await bcrypt.hash(req.body.newPassword.trim(), 10);
        // update password
        r.db(process.env.DATA_DB).table('users').get(userID).update({
          password: newPassword
        }).run(req._dbconn, function (err, result) {
          if (err) {
            internalServerErrorResponse(res, "Error while updating password.");
            return next(err);
          }
          r.db(process.env.DATA_DB).table('resetPassTokens').filter({
            userID: userID
          }).delete().run(req._dbconn, function (err, result) {
            if (err) next(err);
          })
          const response = {
            message: "You've succesfully reseted your password!"
          }
          return res.status(200).json(response);
        });
      } else {
        const response = {
          message: "Sorry, please request change to your password again."
        }
        return res.status(400).json(response);
      }
    });
  });
});
/* /user ROUTES */
router.use('/user', TokenValidator, users);
/* /moods ROUTES */
router.use('/mood', TokenValidator, moods)
module.exports = router;