/*jslint node: true, vars: true, nomen: true */
'use strict';

const async = require('async');
const request = require('request');
const fs = require('fs');
const Path = require('path');

const debug = require('debug')('xpl-push:pushEngine');
const debugFilter = require('debug')('xpl-push:pushEngine:filter');

const GCM_SERVER_URL = "https://android.googleapis.com/gcm/send";

class PushEngine {

  constructor(configuration, xpl, store, deviceAliases) {
    this._configuration=configuration;
    this._deviceAliases = deviceAliases;
    this._xpl = xpl,0
    this._store = store;
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

            debug("_loadConfiguration", "load content of", fpath," done")
            
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

      var tasks=[];
      if (rule.gcm) {
        tasks.push(this._sendGCM.bind(this, rule, message));
      }
      if (rule.wns) {
        tasks.push(this._sendWNS.bind(this, rule, message));       
      }
      if (rule.ios) {
        tasks.push(this._sendIOS.bind(this, rule, message));       
      }
      if (rule.prowl) {
        tasks.push(this._sendProwl.bind(this, rule, message));       
      }

      async.parallel(tasks, callback);

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
    
    if (filter.in.indexOf(type)===0) {
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

    debug("_filter_inDeviceList", "Search deviceName=",deviceName)
    
    
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
  _sendGCM(rule, message, callback) {
    debug("_sendGCM", "rule=",rule,"message=",message);

    this._store.listClients('gcm', rule.id, (error, list) => {
      if (error) {
        return callback(error);
      }

      debug("_sendGCM", "List client returns",list);
      if (!list.length) {
        return;
      }

      var rids=list.map((client) => client.pushURL);

      var msg={ registration_ids: rids, data: message};

      if (rule.gcm.restricted_package_name) {
        msg.restricted_package_name=rule.gcm.restricted_package_name;
      }

      var params={ url: GCM_SERVER_URL, 
          method: "POST",
          json: true,
          headers: {
            "content-type": "application/json",
            "Authorization": rule.gcm.apiKey
          },
          body: JSON.stringify(msg)
      };

      debug("_sendGCM", "send request=", params);

      request(params, (error, response, body) => {
        if (error) {
          return callback(error);
        }

        debug("_sendGCM", "statusCode=",response.statusCode,"statusMessage=",response.statusMessage);

        if (response.statusCode===401) {
          console.error("RESET access key ???");
          return callback();
        }

        if (response.statusCode!=200) {
          console.error("Response error, statusCode=",response.statusCode,"statusMessage=",response.statusMessage);
          return callback();
        }

        var rjson = JSON.parse(body);

        debug("_sendGCM", "response json=",rjson);

        var idx=0;
        async.eachSeries(rjson.results, (state, callback) => {
          var client=list[idx++];

          debug("_sendGCM", "State of client",client,"state=",state);

          if (state.message_id) {
            if (state.registration_id) {
              debug("_sendGCM", "Change pushURL to",state.registration_id);
              this._store.updatePushURL(client, state.registration_id, callback);
              return;
            }

            this._store.recordClientSuccess(client, callback);
            return;
          }

          if (state.error) {
            if (state.error==="NotRegistred") {
              this._store.unregisterClient(client, callback);
              return;
            }

            console.error("GCM error=",state.error,"for client=",client);
            this._store.recordClientError(client, state.error, callback);
            return;
          }

          console.error("Unsupported response",state);
          callback();

        }, (error) => {

          callback(error);
        });
      });
    });
  }
  _sendWNS(rule, message, callback) {
    callback();
  }
  _sendIOS(rule, message, callback) {
    callback();
  }
  _sendProwl(rule, message, callback) {
    callback();
  }
}

module.exports = PushEngine;