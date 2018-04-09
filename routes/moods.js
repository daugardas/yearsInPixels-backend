var express = require('express');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');

/* GET MOODS */
router.get('/', function(req, res){
  res.status(200).send(`GET /mood is still being created`);
});

/* POST MOODS */
router.post('/', function(req, res){
  res.status(200).send(`POST /mood is still being created`);
});

/* PUT MOODS */
router.put('/', function(req, res){
  res.status(200).send(`PUT /mood is still being created`);
});

/* DELETE MOODS */
router.delete('/', function(req, res){
  res.status(200).send(`DELETE /mood is still being created`);
});

module.exports = router;