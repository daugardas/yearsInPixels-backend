var express = require('express');
var router = express.Router();
var bcrypt = require('bcrypt');
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');

function updateUser(dbConn, userID, username, email, password, updateCount) {
  r.db(process.env.DATA_DB).table('users').filter({
    id: userID
  }).update({
    username: username,
    email: email,
    password: password,
    timesUpdated: r.row('timesUpdated').add(1).default(1),
    userInfoOldInfo: r.row("userInfoOldInfo").default([]).append(updateCount)
  }).run(dbConn, function (updateErr, updateCursor) {
    if (updateErr) {
      throw updateErr
    }
  });
}
function deleteUser(dbConn, userID) {
  return new Promise(resolve => {
    r.db(process.env.DATA_DB).table('users').get(userID).delete().run(dbConn, function (err, result) {
      if (err) throw err;
      resolve(result);
    });
  });
}
function internalServerErrorResponse(res, err) {
  let jsonResponse = {
    message: err
  };
  res.status(500).json(jsonResponse);
}
function comparePasswords(received, existingHash) {
  return new Promise(resolve => {
    bcrypt.compare(received, existingHash, function (err, correctPass) {
      if (err) {
        throw err;
      }
      resolve(correctPass);
    });
  });
}
/* GET USER DATA */
router.get('/', function (req, res,next) {
  r.db(process.env.DATA_DB).table('users').get(req.decoded.id).run(req._dbconn, function(err, result){
    if (err) {
      internalServerErrorResponse(res, err);
      return next(err);
    }
    if(result){
      let response = {
        dateCreated: result.dateCreated,
        id: result.id,
        username: result.username,
        email: result.email,
        moods: result.moods,
      };
      return res.status(200).json(response);
    } else{
      // send error
      let jsonResponse = {
        message: "User doesn't exist"
      };
      return res.status(400).json(jsonResponse);
    } 
  });
});
/* PUT USER DATA */
router.put('/', function (req, res, next) {
  r.db(process.env.DATA_DB).table('users').filter({
    id: req.decoded.id
  }).run(req._dbconn, function (err, cursor) {
    if (err) {
      internalServerErrorResponse(res, err, "Internal Server Error");
      return next(err);
    }
    cursor.toArray(function (err, user) {
      if (err) {
        internalServerErrorResponse(res, err, "Internal Server Error");
        return next(err);
      }
      // if user exists
      if (user[0]) {
        let hashPass = user[0].password;
        // confirm passwords
        bcrypt.compare(req.body.password, hashPass, function (err, correctPass) {
          if (err) {
            internalServerErrorResponse(res, err);
            return next(err);
          }
          if (correctPass) {
            // Update user information
            let newInfo = {};
            if (req.body.newUsername) {
              newInfo.username = req.body.newUsername;
            } else { // else keep unchanged
              newInfo.username = user[0].username;
            }
            if (req.body.newEmail) {
              newInfo.email = req.body.newEmail;
            } else { // else keep unchanged
              newInfo.email = user[0].email;
            }
            if (req.body.newPassword) { // two parts because bcrypt hashing needs time and doesnt succeed to create a hash in time
              bcrypt.hash(req.body.newPassword, 10, function (hashErr, hash) {
                if (hashErr) next(hashErr);
                newInfo.password = hash;
                let update = {
                  lastUpdated: Date.now(),
                };
                try {
                  updateUser(req._dbconn, req.decoded.id, newInfo.username, newInfo.email, newInfo.password, update);
                } catch (e) {
                  internalServerErrorResponse(res, e, "Error while updating user profile.")
                  return next(e);
                }
              });
            } else { // else keep unchanged
              newInfo.password = hashPass;
              let update = {
                lastUpdated: Date.now(),
              };
              try {
                updateUser(req._dbconn, req.decoded.id, newInfo.username, newInfo.email, newInfo.password, update);
              } catch (e) {
                internalServerErrorResponse(res, e, "Error while updating user profile.")
                return next(e);
              }
            }
            let newUserInformaton = {
              dateCreated: user[0].dateCreated,
              email: newInfo.email,
              id: user[0].id,
              username: newInfo.username
            };
            jwt.sign(newUserInformaton, process.env.JWT_SECRET, {
              expiresIn: "1d"
            }, function (err, token) {
              if (err) return next(err);
              let jsonResponse = {
                data: newUserInformaton,
                message: "Updated.",
                token: token
              };
              return res.status(201).json(jsonResponse);
            });
          } else {
            let jsonResponse = {
              error: "Bad password.",
            }
            return res.status(401).json(jsonResponse);
          }
        });
      }
    });
  });
});
/* DELETE USER DATA */
router.delete('/', function (req, res, next) {
  r.db(process.env.DATA_DB).table('users').filter({
    id: req.decoded.id
  }).run(req._dbconn, function (err, cursor) {
    if (err) {
      internalServerErrorResponse(res, err, "Internal Server Error");
      return next(err);
    }
    cursor.toArray(async function (err, user) {
      if (err) {
        internalServerErrorResponse(res, err, "Internal Server Error");
        return next(err);
      }
      if (user[0]) { // if user exists
        try {
          let isPassCorrect = await comparePasswords(req.body.password, user[0].password);
          if (isPassCorrect) { // passwords match
            await deleteUser(req._dbconn, user[0].id).then(deleted => {
              let jsonResponse = {
                message: "Succesfully deleted user profile"
              };
              return res.status(200).json(jsonResponse);
            });
          } else {
            let jsonResponse = {
              error: "Bad password",
            };
            return res.status(401).json(jsonResponse);
          }
        } catch (e) {
          internalServerErrorResponse(res, e, "Encountered an error");
          return next(e);
        }
      } else {
        let jsonResponse = {
          error: "User not found"
        };
        return res.status(404).json(jsonResponse);
      }
    });
  });
});
router.get('/mood', function(req, res, next){
  r.db(process.env.DATA_DB).table('users').get(req.decoded.id).pluck('moods').run(req._dbconn, function(err, result){
    if (err) {
      return internalServerErrorResponse(res, err);
    }
    if(result){
      return res.status(200).json(result);
    } else {
      return res.status(400).json({
        error: `Couldn't find user.`
      });
    }
  })
});
router.post('/mood', async function (req, res, next) {
  r.uuid().run(req._dbconn, function (err, result) {
    if (err) {
      internalServerErrorResponse(res, err, "Internal Server Error");
      return next(err);
    }
    let newMoodID = result;
    r.db(process.env.DATA_DB).table('users').get(req.decoded.id).update({
      moods: r.row('moods').append({
        moodName: req.body.moodName.trim(),
        moodColor: req.body.moodColor,
        moodID: newMoodID
      })
    }).run(req._dbconn, function (err, result) {
      if (err) {
        internalServerErrorResponse(res, err, "Internal Server Error");
        return next(err);
      }
      return res.status(200).json({ message: "Successfully added new mood!" });
    });
  })
});
router.put('/mood', function (req, res, next) {
  r.db(process.env.DATA_DB).table('users').get(req.decoded.id).update({
    moods: r.row('moods').map(mood => r.branch(mood('moodID').eq(req.body.moodID), mood.merge(
      {
        moodName: req.body.moodName.trim(),
        moodColor: req.body.moodColor
      }), mood)
    )
  }).run(req._dbconn, function (err, result) {
    if (err) {
      internalServerErrorResponse(res, err, "Internal Server Error");
      return next(err);
    }
    return res.status(200).json({ message: "Successfully updated mood!" })
  });
});
router.delete('/mood', function (req, res, next) {
  r.db(process.env.DATA_DB).table('users').get(req.decoded.id).update({
    moods: r.row('moods').filter(mood => mood('moodID').ne(req.body.moodID))
  }).run(req._dbconn, function (err, result) {
    if (err) {
      internalServerErrorResponse(res, err, "Internal Server Error");
      return next(err);
    }
    return res.status(200).json({ message: "Successfully deleted mood!" })
  });
});
module.exports = router;