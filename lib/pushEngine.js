/*jslint node: true, esversion: 6 */
'use strict';

const async = require('async');
const fs = require('fs');
const Path = require('path');

const GCMChannel = require('./gcmChannel');

const debug = require('debug')('xpl-push:pushEngine');
const debugFilter = require('debug')('xpl-push:pushEngine:filter');

class PushEngine {

  constructor(configuration, xpl, store, deviceAliases) {
    this._configuration=configuration;
    this._deviceAliases = deviceAliases;
    this._xpl = xpl;
    this._store = store;
    
    this._channels={};
    this._requires={};
  }

  static fillCommander(commander) {    
    commander.option("--config <path>", "Configuration path");
  }

  start(callback) {
    this._loadConfiguration((error) => {
      if (error) {
        return callback(error);
      }

      var processMessage = (message) => {
        debug("start", "Process message=", message);

        if (message.bodyName === "sensor.basic") {
          this._processMessage(message, (error) => {
            if (error) {
              console.error(error);
            }
          });
          return;
        }
      };

      this._xpl.on("xpl:xpl-trig", processMessage);
      this._xpl.on("xpl:xpl-stat", processMessage);

      callback(null, this._rules);
    });
  }
  
  _createChannels(rule) {
    return {
        gcm: new GCMChannel(this._store, rule)       
    };
  }

  _loadConfiguration(callback) {
    var path=this._configuration.config;
    if (!path) {
      return callback("Path of filters configuration is not specified");
    }

    debug("_loadConfiguration", "load configuration path=", path);

    fs.readFile(path, (error, data) => {
      if (error) {
        return callback(error);
      }

      var json;
      try {
        json=JSON.parse(data);

      } catch (x) {
        var er=new Error("Can not parse JSON : "+path);
        er.path=path;
        er.source = x;
        
        return callback(er);
      }

      this._rules=json;
      debug("_loadConfiguration", "Loaded configuration=", json);

      async.each(this._rules, (rule, callback) => {
        if (!rule.filters) {
          return callback();
        }

        this._channels[rule.id]=this._createChannels(rule);
        
        async.each(rule.filters, (filter, callback) => {
          if (!filter.path) {
            return callback();
            }

          debug("_loadConfiguration", "Load content",filter.path,"for filter",filter.id);

          var fpath=Path.join(path, '..', filter.path);
          debug("_loadConfiguration", "computed path=", fpath);
          
          fs.readFile(fpath, (error, data) => {
            if (error) {
              console.error("Can not load file path=", fpath, "error=",error);
              return callback(error);
            }

            debug("_loadConfiguration", "load content of", fpath," done");
            
            if (/\.json$/i.exec(filter.path)) {
              try {
                data=JSON.parse(data);

              } catch (x) {
                return callback(x);
              }
            }

            debug("_loadConfiguration", "Filter data=",data);
            
            filter.$content=data;

            callback();
          });            
        }, callback);        
      }, callback);
    });    
  }
  
  _require(name) {
    var r=this._requires[name];
    if (r) {
      return r;
    }
    
    var p;
    try {
      debug("_require", "Search require", name);
      r=require(name);
      
    } catch (x) {
      try {
        p='./'+name;
        
        debug("_require", "Search require", p);

        r=require('./'+name);
        
      } catch (x2) {
        p=Path.join(this._configuration.config, '..', name);
        
        debug("_require", "Search require", p);
        
        try {
          r=require(p);
          
        } catch (x3) {
          var ex = new Error("Can not load require '"+name+"'");
          ex.source=x3;
          throw ex;
        }
      }
    }
    
    debug("_require", "equire", name, "loaded :", r);
    
    this._requires[name]=r;
    
    return r;
  }

  _processMessage(message, callback) {
    debug("_processMessage", "Process", message);

    async.each(this._rules, (rule, callback) => {
      var filters = rule.filters;
      if (filters instanceof Array) {
        for(var filter of filters) {
          
          var fn;
          try {
            fn = this._require(filter.require);
            
          } catch (x) {
            console.error(x);
            continue;
          }
          
          if (typeof(fn)!=='function') {
            console.error("Unknown filter",filter.name);
            continue;
          }

          try {
            if (fn.call(this, filter, message)===false) {
              debug("_processMessage", "Rule=",rule.id," filter=",filter.name," does not accept message");
              return callback();
            }
          } catch (x) {
            return callback(x);
          }
          
          debug("_processMessage", "Rule=",rule.id," filter=",filter.name," accepts message");
        }        
      }
      
      var pushMessage = Object.assign({}, message.body);
      
      async.eachSeries(rule.decorators || [], (decorator, callback) => {
        debug("_processMessage", "Decorator=",decorator);
        
        var r=this._require(decorator.require);
        
        r(decorator, rule, this._store, pushMessage, callback);
        
      }, (callback) => {        
        async.forEachOf(this._channels[rule.id], (channel, key, callback) => {
          channel.pushMessage(pushMessage, callback);
        }, callback);
      });
      
    }, callback);
  }

    
}

module.exports = PushEngine;