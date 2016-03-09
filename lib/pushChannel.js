/*jslint node: true, esversion: 6 */
'use strict';

const assert = require('assert');
const debug = require('debug')('xpl-push:pushChannel');

class PushChannel {
  
  constructor(store, rule) {
    assert(store, "Store parameter is invalid");
    assert(rule, "Rule parameter is invalid");
    
    this._store = store;
    this._rule = rule;
    
    this._messages = [];
  }
  
  get maxRateLimit() {
    throw new Error("Must be implemented !");
  }
  
  pushMessage(message, callback) {    
    debug("pushMessage", "rule=",this._rule.id, "message=",message);

    this._messages.push(message);
        
    if (this._timerId) {
      debug("pushMessage", "Timer running, push message");      
      return callback();
    }
    
    var self=this;
    
    debug("pushMessage", "Start timer now=",Date.now());
    
    this._timerId=setTimeout(function onTimer() {
      var messages=self._messages;
      self._messages=[];
      var dt=Date.now();

      debug("pushMessage", "Message timeout now=",dt,"messages=",messages);      

      self._pushMessages(messages, (error) => {
        delete self._timerId;
        if (error) {
          console.error("Error during pushing message", error);
        }
        
        if (!self._messages.length) {
          debug("pushMessage", "No more message, stop timer");
          return;
        }

        var ndt=Date.now()-dt;
        
        var delay=Math.max(self.maxRateLimit-ndt, 5);

        debug("pushMessage", "New ",self._messages.length, "messages, restart timer for",delay,"ms");

        setTimeout(onTimer, delay);
      });
      
    }, this.maxRateLimit/2);
    
    callback();
  }

}

module.exports = PushChannel;