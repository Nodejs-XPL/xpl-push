/*jslint node: true, vars: true, nomen: true */
'use strict';

const Xpl = require("xpl-api");
const commander = require('commander');
const os = require('os');
const debug = require('debug')('xpl-push');
const API = require('./lib/API');
const HttpServer = API.httpServer;
const NeDB_Store = API.nedb_store;
const PushEngine = API.pushEngine;

var Store= NeDB_Store;

commander.version(require("./package.json").version);
commander.option("-a, --deviceAliases <aliases>", "Devices aliases");

Xpl.fillCommander(commander);
HttpServer.fillCommander(commander);
NeDB_Store.fillCommander(commander);
PushEngine.fillCommander(commander);

commander.command("create").action(() => {

  var store = new Store(commander);

  store.create((error) => {
    if (error) {
      console.error(error);
      return;
    }
  });
});


commander.command("run").action(() => {

  var deviceAliases = Xpl.loadDeviceAliases(commander.deviceAliases);

  var store = new Store(commander);
  store.connect((error) => {
    if (error) {
      console.error(error);
      return;
    }

    var xpl = new Xpl(commander);

    xpl.on("error", (error) => {
      console.error("XPL error", error);
    });

    xpl.bind((error) => {
      if (error) {
        console.error("Can not open xpl bridge ", error);
        process.exit(2);
        return;
      }

      var pushEngine=new PushEngine(commander, xpl, store, deviceAliases);
      pushEngine.start((error, rules) => {
        if (error) {
          console.error("Can not start engine", error, error.stack);
          process.exit(3);
          return;
        }
  
        var server=new HttpServer(commander, store, rules);
  
        server.listen((error) => {
          if (error) {
            console.error(error);
            return;
          }
          
          
        });
      });
    });    
  });
});


commander.parse(process.argv);
