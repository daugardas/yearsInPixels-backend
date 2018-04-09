var express = require('express');
var router = express.Router();
var r = require('rethinkdb'); // database
var jwt = require('jsonwebtoken');
var TokenValidator = require('../middleware/TokenValidator');

/* GET /journal */
router.get('/', function(req, res){
  res.status(200).send(`GET /journal is still being created`);
});

/* POST /journal */
router.post('/', function(req, res){
  res.status(200).send(`POST /journal is still being created`);
});

/* PUT /journal */
router.put('/', function(req, res){
  res.status(200).send(`PUT /journal is still being created`);
});

/* DELETE /journal */
router.delete('/', function(req, res){
  res.status(200).send(`DELETE /journal is still being created`);
});

module.exports = router;