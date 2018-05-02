var express = require('express');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');

function internalServerErrorResponse(res, err, message) {
  console.error(err);
  let jsonResponse = {
    status: 500,
    data: null,
    message: message
  };
  res.status(500).json(jsonResponse);
}

function getMoodsId(req) {
  return new Promise(resolve => {
    return r.uuid().run(req._dbconn, function (err, uuid) {
      if (err) {
        internalServerErrorResponse(res, err, "Error while generating UUID for moods");
        throw err;
      }
      resolve(uuid);
    });
  });
}


function checkMoodPost(req) {

  return new Promise(resolve => {

    // if req.body is empty
    if (Object.keys(req.body).length === 0) {
      throw "Request JSON object is empty.";
    }

    if (!req.body.hasOwnProperty("date") || !req.body.hasOwnProperty("dayMoods")) {
      throw "Request JSON object is missing a property.";
    } else {
      let possibleErrors = [];
      if (req.body.date.length < 3 || req.body.date.length > 3) {
        possibleErrors.push("Request Date array has invalid length.");
      }

      if (req.body.dayMoods.length === 0) {
        possibleErrors.push("Request dayMoods array is empty")
      } else {
        let noNeededProperty = false;
        req.body.dayMoods.forEach(mood => {

          if (!mood.hasOwnProperty("moodId") || !mood.hasOwnProperty("percentage")) {
            noNeededProperty = true;
          }

        });
        if (noNeededProperty) {
          possibleErrors.push("A mood doesn't have needed properties.")
        }
      }

      if (possibleErrors.length > 0) {
        let error = possibleErrors.join(" && ");
        throw error;
      }
      resolve("No errors.");
    }


  });
}

function checkMoodPut(req) {
  return new Promise(resolve => {
    // if req.body is empty
    if (Object.keys(req.body).length === 0) {
      throw "Request JSON object is empty.";
    }

    // check if it has needed properties
    if (!req.body.hasOwnProperty("id")) {
      throw "Request doesn't have id of the mood you're trying to update";
    } else if (!req.body.hasOwnProperty("dayMoods")) {
      throw "Request is missing a dayMoods property";
    } else {
      let possibleErrors = [];
      if (!(typeof req.body.id === "string")) {
        possibleErrors.push("Request id property's value isn't a string");
      }


      if (req.body.dayMoods.length === 0) {
        possibleErrors.push("Request dayMoods array is empty")
      } else {
        let noNeededProperty = false;
        req.body.dayMoods.forEach(mood => {

          if (!mood.hasOwnProperty("moodId") || !mood.hasOwnProperty("percentage")) {
            noNeededProperty = true;
          }

        });
        if (noNeededProperty) {
          possibleErrors.push("A mood doesn't have needed properties.")
        }
      }

      if (possibleErrors.length > 0) {
        let error = possibleErrors.join(" && ");
        throw error;
      }
      resolve("No errors.");
    }

  });
}

function checkMoodDelete(req) {
  return new Promise(resolve => {
    // if req.body is empty
    if (Object.keys(req.body).length === 0) {
      throw "Request JSON object is empty.";
    }

    // check if it has needed properties
    if (!req.body.hasOwnProperty("id")) {
      throw "Request doesn't have id of the mood you're trying to update";
    } else if (!(typeof req.body.id === "string")) {
      throw "Request id property's value isn't a string";
    }
    resolve("No errors.");
  });
}
/* GET MOODS */
router.get('/', function (req, res, next) {
  // find all user moods using user id
  r.table("moods").filter({
    id: req.decoded.id
  }).run(req._dbconn, function (err, cursor) {
    if (err) {
      internalServerErrorResponse(res, err, "Error happened when trying to connect to database.");
      return next(err);
    }

    cursor.toArray(function (err, moods) {
      if (err) {
        internalServerErrorResponse(res, err, "Error happened when trying to cursor database answer");
        return next(err);
      }

      // if user has moods
      if (moods.length > 0) {
        let jsonResponse = {
          status: 200,
          data: moods,
          message: `Successfully retrieved ${moods[0].moods.length} ${moods[0].moods.length > 1 ? "days":"day"} of moods`
        };
        return res.status(200).json(jsonResponse)
      } else { // user doesn't have moods

        let jsonResponse = {
          status: 400,
          message: "User doesn't have any saved moods."
        };
        return res.status(400).json(jsonResponse);
      }
    });
  });
});

/* POST MOODS */
router.post('/', function (req, res, next) {
  // connect to database

  r.table('moods').get(req.decoded.id).run(req._dbconn, async function (err, result) {
    if (err) {
      internalServerErrorResponse(res, err, "Error happened while trying to connect to database");
      return next(err);
    }

    try {
      await checkMoodPost(req);
    } catch (checkErr) {
      let jsonResponse = {
        status: 400,
        message: checkErr
      };
      return res.status(400).json(jsonResponse);
    }
    const moodsID = await getMoodsId(req);

    let dayMoods = {
      id: moodsID,
      date: req.body.date,
      dayMoods: req.body.dayMoods
    }

    // if there is a document with a given id
    if (result) {
      // then add the day mood to the moods array in db
      r.table('moods').get(req.decoded.id).update({
        moods: r.row("moods").append(dayMoods)
      }).run(req._dbconn, function (updateErr, updateRes) {
        if (err) {
          internalServerErrorResponse(res, updateErr, "Error when trying to append day moods to moods array in db");
          return next(updateErr);
        }

        let jsonResponse = {
          status: 200,
          message: "Successfully inserted day moods data to database moods array."
        };
        return res.status(200).json(jsonResponse);
      });

    } else { // if there isn't, then create

      r.table('moods').insert({
        id: req.decoded.id,
        moods: [dayMoods]
      }).run(req._dbconn, function (err, result) {
        if (err) {
          internalServerErrorResponse(res, err, "Error when trying to insert moods data to database");
          return next(err);
        }

        //console.log(result);
        let jsonResponse = {
          status: 200,
          message: "Successfully inserted moods data to database."
        };
        return res.status(200).json(jsonResponse);
      });

    }
  });
});

/* PUT MOODS */
router.put('/', function (req, res, next) {

  //search for db document with client user id
  let userID = req.decoded.id;

  r.table('moods').get(userID).run(req._dbconn, async function (userErr, result) {
    if (userErr) {
      internalServerErrorResponse(res, err, "Error happened while trying to connect to database");
      return next(err);
    }
    //if user has moods
    if (result) {
      // check if request is valid
      try {
        await checkMoodPut(req);
      } catch (checkErr) {
        let jsonResponse = {
          status: 400,
          message: checkErr
        };
        return res.status(400).json(jsonResponse);
      }



      r.table('moods').get(userID).update({
        "moods": r.row('moods').map(function (mood) {
          return r.branch(mood('id').eq(req.body.id), mood.merge({
            "dayMoods": req.body.dayMoods
          }), mood);
        })
      }).run(req._dbconn, function (err, result) {
        if (err) {
          internalServerErrorResponse(res, err, "Error happened while trying to update a mood");
          return next(err);
        }

        let jsonResponse = {
          status: 200,
          message: "Successfully updated a user mood."
        };
        return res.status(200).json(jsonResponse);
      });


    } else {
      // send error
      let jsonResponse = {
        status: 400,
        message: "User doesn't have any moods to update."
      };
      return res.status(400).json(jsonResponse);
    }
  });
});

/* DELETE MOODS */
router.delete('/', async function (req, res, next) {
  let userID = req.decoded.id;

  // verify request
  try {
    await checkMoodDelete(req);
  } catch (e) {
    let response = {
      status: 400,
      message: e
    };
    return res.status(400).json(response);
  }

  r.table('moods').get(userID).update({
    "moods": r.row('moods').filter(mood => mood('id').ne(req.body.id))
  }).run(req._dbconn, function (err, result) {
    if (err) {
      internalServerErrorResponse(res, err, "Error happened while trying to delete a user mood.");
      return next(err);
    }

    let response = {
      status: 200,
      message: "Successfully deleted a user mood or it didn't exist."
    };
    return res.status(200).json(response);
  });
});

module.exports = router;