/*jslint node: true, esversion: 6 */
'use strict';

const debug = require('debug')('xpl-push:filters:type');

module.exports = function(filter, message) {
  if (!filter.in) {
    throw new Error("No specified types");
  }

  var type=message.body.type;

  debug("filter", "Search type=",type,"in",filter.in);    

  if (!type) {
    return false;
  }

  if (filter.in.indexOf(type)>=0) {
    return true;
  }

  return false;
};
