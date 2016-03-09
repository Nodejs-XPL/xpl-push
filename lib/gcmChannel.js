/*jslint node: true, esversion: 6 */
'use strict';

const async = require('async');
const request = require('request');

const debug = require('debug')('xpl-push:GCMChannel');

const PushChannel = require('./pushChannel');

const GCM_SERVER_URL = "https://android.googleapis.com/gcm/send";

const GCM_MAX_RATE_LIMIT=250;

class GCMChannel extends PushChannel {
  
  constructor(store, rule) {
    super(store, rule);
  }
  
  get maxRateLimit() {
    return GCM_MAX_RATE_LIMIT;
  }

  _pushMessages(messages, callback) {
    var rule=this._rule;
    
    this._store.listClients('gcm', rule.id, (error, list) => {
      if (error) {
        return callback(error);
      }

      debug("_pushMessages", "List client returns",list);
      if (!list.length) {
        return;
      }

      var rids=list.map((client) => client.pushURL);

      var msg={ registration_ids: rids, data: JSON.stringify(messages)};

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

      debug("_pushMessages", "send request=", params);

      request(params, (error, response, body) => {
        if (error) {
          return callback(error);
        }

        debug("_pushMessages", "statusCode=",response.statusCode,"statusMessage=",response.statusMessage);

        if (response.statusCode===401) {
          console.error("RESET access key ???");
          return callback();
        }

        if (response.statusCode!=200) {
          console.error("Response error, statusCode=",response.statusCode,"statusMessage=",response.statusMessage);
          return callback();
        }

        var rjson = JSON.parse(body);

        debug("_pushMessages", "response json=",rjson);

        var idx=0;
        async.eachSeries(rjson.results, (state, callback) => {
          var client=list[idx++];

          debug("_pushMessages", "State of client",client,"state=",state);

          if (state.message_id) {
            if (state.registration_id) {
              debug("_pushMessages", "Change pushURL to",state.registration_id);
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

}

module.exports = GCMChannel;