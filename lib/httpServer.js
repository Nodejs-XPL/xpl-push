/*jslint node: true, vars: true, nomen: true */
'use strict';

const express = require('express');
var debug = require('debug')('xpl-push:httpServer');
const bodyParser = require('body-parser');
const compression = require('compression');

class HttpServer {
  
  constructor(configuration, store, rules) {
    this._configuration=configuration;
    this._store = store;
    this._rules = rules;

    if (configuration.express) {
      this.app = configuration.express;
      
    } else {
      var app = express();
      this.app = app;
      app.enable('etag');
      app.use(compression());  
      app.use(bodyParser.json());
      app.use(bodyParser.urlencoded({
        extended: true
      }));
    }
  }
  
  static fillCommander(commander) {    
    commander.option("--httpPort <port>", "Http server port", parseInt);
  }
  
  listen(callback) {
    var app = this.app;
    var parentPath=this._configuration.parentPath || '';
    
    this._rules.forEach((rule) => {
      var p=parentPath+"/"+rule.id+"/register";
      
      app.post(p, this._register.bind(this, rule));
    });
    
    if (this._configuration.staticPath) {
  
      var oneYear = 1000*60*60*24*365;      
  
      app.use(express.static(__dirname + '/public', {  }));
  
      app.use("/config", serve_static(this._configuration.staticPath, {
        index : false, 
        maxAge: oneYear
      }));
    }
  
    app.use(function(req, res, next) {
      res.status(404).send('Sorry cant find that!');
    });
  
    var server = app.listen(this._configuration.httpPort || 8480, (error) => {
      if (error) {
        console.error("Server can not listen", error);
        return;
      }
      debug("listen", "Server is listening ", server.address());
  
      callback();
    });
  }
  
  _register(rule, request, response) {
    var params=request.params;
    var phoneId=params.phoneId;
    var pushURL=params.pushURL;
    var channel="unknown";
    
    var agent=request.headers['agent'];
    if (agent && /android/i.exec(agent)) {
      channel="gcm";
    }

    if (agent && /windows/i.exec(agent)) {
      channel="wns";
    }

    debug("_register", "Register client params=",params,"headers=",request.headers,"rule=",rule);

    this._store.registerClient(channel, rule.id, phoneId, pushURL, (error) => {
      if (error) {
        console.error(error);
      }
    });
  }
}
  
module.exports = HttpServer;