/*jslint node: true, esversion: 6 */
'use strict';

const debug = require('debug')('xpl-push:filters:type');

module.exports = function(filter, message) {
  if (!filter.$content) {
    throw new Error("No list for "+filter.path);
  }

  var body = message.body;

  var deviceName = body.device;
//var current = body.current;

  if (this._deviceAliases && this._deviceAliases[deviceName]) {
    deviceName = this._deviceAliases[deviceName];
  }

  debug("_filter_inDeviceList", "Search deviceName=",deviceName);    
  
  for(var k in filter.$content) {
    var v=filter.$content[k];

    if (typeof(v)==="string") {
      debug("_filter_inDeviceList", "Test",v,"/",deviceName);
      
      if (v===deviceName) {
        return true;
      }

      continue;
    }

    if (typeof(v)==="object") {
      for(var dv in v) {
        debug("_filter_inDeviceList", "Test",dv,"/",deviceName);

        if (dv===deviceName) {
          return true;
        }
      }
      
      continue;
    }
  }

  return false;
};
