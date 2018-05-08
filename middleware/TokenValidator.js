var jwt = require('jsonwebtoken');

module.exports = function(req, res, next){
  var token = req.body.token || req.query.token || req.headers['x-access-token'];

  // decode the token
  if(token){
    // verify secret and check if expired
    jwt.verify(token, process.env.JWT_SECRET, function(err, decoded){
      if(err) return res.json({"error": true, "message": 'Failed to authenticate token.'});
      // no err
      req.decoded = decoded;
      next();
    });

  } else {
    // no token - return error
    return res.status(403).send({
      "error": 'No token provided.'
    });
  }
}