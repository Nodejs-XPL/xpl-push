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
        return callback(x);
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

  _processMessage(message, callback) {
    debug("_processMessage", "Process", message);

    async.each(this._rules, (rule, callback) => {
      var filters = rule.filters;
      if (filters instanceof Array) {
        for(var filter of filters) {
          var fn=this['_filter_'+filter.name];
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
      
      var pushMessage = message.body;

      async.forEachOf(this._channels[rule.id], (channel, key, callback) => {
        channel.pushMessage(pushMessage, callback);
      }, callback);

    }, callback);
  }

  _filter_type(filter, message) {
    if (!filter.in) {
      throw new Error("No specified types");
    }
    
    var type=message.body.type;
    
    debug("_filter_type", "Search type=",type,"in",filter.in);    
    
    if (!type) {
      return false;
    }
    
    if (filter.in.indexOf(type)>=0) {
      return true;
    }
    
    return false;
  }
  
  _filter_inDeviceList(filter, message) {
    if (!filter.$content) {
      throw new Error("No list for "+filter.path);
    }

    var body = message.body;

    var deviceName = body.device;
// var current = body.current;

    if (this._deviceAliases && this._deviceAliases[deviceName]) {
      deviceName = this._deviceAliases[deviceName];
    }

    debug("_filter_inDeviceList", "Search deviceName=",deviceName);    
    
    for(var k in filter.$content) {
      var v=filter.$content[k];

      if (typeof(v)==="string") {
        debugFilter("_filter_inDeviceList", "Test",v,"/",deviceName);
        
        if (v===deviceName) {
          return true;
        }

        continue;
      }

      if (typeof(v)==="object") {
        for(var dv in v) {
          debugFilter("_filter_inDeviceList", "Test",dv,"/",deviceName);

          if (dv===deviceName) {
            return true;
          }
        }
        
        continue;
      }
    }

    return false;
  }
}

module.exports = PushEngine;