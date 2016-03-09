/*jslint node: true, vars: true, nomen: true */
'use strict';

const Datastore = require('nedb');
const debug = require('debug')('xpl-push:nedb');
const Path = require('path');

class NeDb_store {
  
  constructor(configuration) {
    this._configuration=configuration;
  }
  
  static fillCommander(commander) {    
    commander.option("--dbPath <path>", "Database path (with filename)");
  }
  
  connect(callback) {
    var path=this._configuration.dbPath;
    if (!path) {
      var home = process.env.HOME || process.env.USERPROFILE;
      
      path=Path.join(home, 'xpl-push');
    }

    debug("connect", "Create dataStore path=",path);

    var db = new Datastore({filename: path, autoload: true});
    
    this._db=db;
    db.ensureIndex({fieldName: 'channel', unique: false }, (error) => {
      if (error) {
        return callback(error);
      }
      
      debug("connect", "Index channel declared");

      db.ensureIndex({fieldName: 'type', unique: false }, (error) => {
        if (error) {
          return callback(error);
        }

        debug("connect", "Index type declared");

        callback();
      });
    });
  }
  
  registerClient(channel, type, phoneId, pushURL, callback) {
    debug("registerClient", "Register channel=", channel, " type=", type, "phoneId=", phoneId, "pushURL=", pushURL);
    this._db.update({ channel: channel, type: type, phoneId: phoneId}, 
        { $set: {pushURL: pushURL, date: new Date() } }, { upsert: true }, (error) => {
      if (error) {
        console.error("Can not register client", error);
        return callback(error);
      }
      
      callback();
    });
  }
  
  listClients(channel, type, callback) {
    debug("listClients", "List client for channel=",channel,"type=",type);
    this._db.find({ channel: channel, type: type}, (error, docs) => {
      if (error) {
        console.error("Can not list client for type=",type,"error=",error);
        return callback(error);
      }
      
      debug("listClients", "Return list for type=",type,"list=",docs);
      
      callback(null, docs);
    });
  }
  
  updatePushURL(client, pushURL, callback) {
    debug("updatePushURL", "change pushURL=",pushURL,"for client=", client);
    
    this._db.update({_id: client._id}, { $set: { pushURL: pushURL }}, {multi: false}, (error) => {
      if (error) {
        console.error("Can not replace pushURL=", pushURL, "for client=",client);
        return callback(error);
      }
      
      debug("updatePushURL", "DONE change pushURL for client=", client);

      callback();
    });
  }
  
  recordClientSuccess(client, callback) {
    debug("recordClientSuccess", "Record success for client",client);
    callback();
  }
  
  recordClientError(client, error, callback) {
    debug("recordClientError", "Record error for client",client,"error=",error);
    callback();    
  }
  
  unregisterClient(client, callback) {
    debug("unregisterClient", "Unregister client client=", client);
    
    this._db.remove({_id: client._id}, (error) => {
      
      debug("unregisterClient", "DONE Unregister client client=", client);

      callback();
    });
  }
}

module.exports = NeDb_store;