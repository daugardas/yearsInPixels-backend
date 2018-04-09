var express = require('express');
var router = express.Router();
var bcrypt = require('bcrypt');
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');

/* GET USER DATA */
router.get('/', function(req, res){

  res.send({"user": req.decoded});

});
/* POST USER DATA  although user data is already posted firsthand when creating a profile, so I probably don't need this route */
router.post('/', function(req, res){
  res.status(200).send("POST /user is still being created");
});
/* PUT USER DATA */
router.put('/', function(req, res){

  r.table('users').filter({id: req.decoded.id}).run(req._dbconn, function(err, cursor){
    if(err) next(err);
    cursor.toArray(function(err, user){
      if (err) next(err);
      // if user exists
      if(user[0]){
        let hashPass = user[0].password;
        // confirm passwords
        bcrypt.compare(req.body.password, hashPass, function(err, correctPass){
          if(err) next(err);
          if(correctPass){
            // Update user information
            
            // chech what to update, then gather the info needed to update
            let oldInfo = {};
            let newInfo = {};
            if(req.body.newUsername){
              oldInfo.username = user[0].username;
              newInfo.username = req.body.newUsername;
            } else { // else keep unchanged
              newInfo.username = user[0].username;
            }
            
            if(req.body.newEmail){
              oldInfo.email = user[0].email;
              newInfo.email = req.body.newEmail;
            } else { // else keep unchanged
              newInfo.email = user[0].email;
            }
            
            let timesProfileUpdated = user[0].timesUpdated ? +user[0].timesUpdated:0;

            if(req.body.newPassword){ // two parts because bcrypt hashing needs time and doesnt succeed to create a hash in time
              bcrypt.hash(req.body.newPassword, 10, function(hashErr, hash){
                if(hashErr) next(hashErr);
                oldInfo.password = "Changed pass.";
                newInfo.password = hash;
                let update = {
                  updateNum: timesProfileUpdated,
                  updateDate: Date.now(),
                  old: oldInfo
                };
                updateUser(req._dbconn, req.decoded.id, newInfo.username, newInfo.email, newInfo.password, update);
                
              });
            } else { // else keep unchanged

              newInfo.password = hashPass;
              let update = {
                updateNum: timesProfileUpdated,
                old: oldInfo
              };
              updateUser(req._dbconn, req.decoded.id, newInfo.username, newInfo.email, newInfo.password, update);
              
            }
            
            res.status(200).send("PUT /user has been created, but still it needs to be implemented with corrent answer to client with new token information");
          } else {
            res.status(500).send("PUT /user has been created, ");
          }
        });
        
      } 

    });
  });

  
});
/* DELETE USER DATA */
router.delete('/', function(req, res){
  res.status(200).send("DELETE /user is still being created");
});

function updateUser(dbConn, userID, username, email, password, updateCount){
  r.table('users').filter({id: userID}).update({
    username: username,
    email: email,
    password: password,
    timesUpdated: r.row('timesUpdated').add(1).default(1),
    userInfoOldInfo: r.row("userInfoOldInfo").default([]).append(updateCount)
  }).run(dbConn, function(updateErr, updateCursor){
    if(updateErr) next(updateErr);
    
  });
}

module.exports = router;