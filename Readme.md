[![Build Status](https://travis-ci.org/mike-goodwin/connect-azuretables.svg?branch=master)](https://travis-ci.org/mike-goodwin/connect-azuretables) [![codecov.io](http://codecov.io/github/mike-goodwin/connect-azuretables/coverage.svg?branch=master)](http://codecov.io/github/mike-goodwin/connect-azuretables?branch=master) [![Code Climate](https://codeclimate.com/github/mike-goodwin/connect-azuretables/badges/gpa.svg)](https://codeclimate.com/github/mike-goodwin/connect-azuretables) [![GitHub license](https://img.shields.io/github/license/mike-goodwin/connect-azuretables.svg)](LICENSE.txt)
[![Dependency Status](https://dependencyci.com/github/mike-goodwin/connect-azuretables/badge)](https://dependencyci.com/github/mike-goodwin/connect-azuretables)
[![Known Vulnerabilities](https://snyk.io/test/github/mike-goodwin/connect-azuretables/badge.svg)](https://snyk.io/test/github/mike-goodwin/connect-azuretables)
[![Coverity Scan Build Status](https://scan.coverity.com/projects/14308/badge.svg)](https://scan.coverity.com/projects/mike-goodwin-connect-azuretables)


Connect-AzureTables
===================

An Azure Table Storage backed session store implementation for [express-session](https://github.com/expressjs/session#session-store-implementation), heavily based on [connect-redis](https://www.npmjs.com/package/connect-redis).


Why?
====

1. Azure tables might not be the most performant place to keep sessions, but they are incredibly cheap and simple to get started. There is no need for a server and the cost is practically zero when you're working at dev scale. So, they seem to be a pretty good option where cost is a bigger factor than performance.
2. Why not?

Usage
=====

You can look at this [example application](https://github.com/mike-goodwin/connect-azuretables-sample) to help you get started.

To install:

    npm install connect-azuretables --save
    
To use:

    var express = require('express');
    var session = require('express-session');
    var AzureTablesStoreFactory = require('connect-azuretables')(session);
    var app = express();
    var options = {}; // <-- connect-azuretables options go here
    app.use(session({ store: AzureTablesStoreFactory.create(options), secret: 'keyboard cat'}));

By default, the Azure storage account will be read from environment variables. Either specify 

    AZURE_STORAGE_CONNECTION_STRING
    
or both of

    AZURE_STORAGE_ACCOUNT
    AZURE_STORAGE_ACCESS_KEY
    
Alternatively you can specify the account/key code as options:

    var options = {storageAccount: '<account name>', accessKey: '<key>'};
    app.use(session({store: AzureTablesStoreFactory.create(options), secret: 'keyboard cat'}));
  
By default the session data will be stored in a table called

    ConnectAzureTablesSessions
    
This can be overridden using 

    var options = {table: 'customtablename'};
  
Whether you use the default or specify your own name, the table will be created if it doesn't already exist.

Expired session clean-up
========================

If you specify a session timeout in the options:

    //set a timeout of 30 minutes
    var options = {sessionTimeOut: 30};
    
The store will also start a cron job to delete expired sessions from the underlying table storage once they are older
than the specified timeout (in minutes). This prevents the table filling up with stale sessions if users do not
explicitly log out. The cron is done using the excellent [cron](https://www.npmjs.com/package/cron) package. The default cron pattern is set to run every minute (`'59 * * * * *'`). You
can override this in the options:

    //run every 2 minutes
    var options = {sessionTimeOut: 30, overrideCron: '0 */2 * * * *'};
    
Touching the session (e.g. if the user makes a request to you application) will reset the timeout period for that
session. This makes browser session cookies (i.e. `cookie.maxAge = null`) behave like rolling sessions.

You can also achieve the same effect by setting `cookie.maxAge` and `rolling: true`. If you set both `cookie.maxAge`
*and* `sessionTimeOut` then the session expiry is based on `maxAge`. In this case `sessionTimeOut` is ignored. 
    
**Note:** There is no concurrency logic to prevent multiple servers trying to clean up the same session in a 
multi-server deployment. To help prevent polluting logs unnecessarily, HTTP 404 errors on deletion are not logged, but still,
this is not ideal. If this is a problem in your application, you could suppress the clean up on your web servers
(just omit the `sessionTimeOut` on the options) and run the clean up code as a separate background job. In the future, this
could be made easier by factoring the clean up into a separate package.
[Raise an issue on Github](https://github.com/mike-goodwin/connect-azuretables/issues) if this would help you.

Logging
=======

The package will log calls to it's core functions if you pass logging functions in the options. For example:

    var options = {logger: console.log, errorLogger: console.log};
    
If supplied, `logger` will be used to log the main operations on sessions - set, get, destroy, touch (typically this would be level INFO or below). The log 
message will contain the session ID, so if this is sensitive for some reason, do not supply a logger. 
It *never* logs the content of the session. 

Errors in the background session clean up are logged using `errorLogger` if it is supplied. Errors in calls to the main operations (like incorrect storage credentials or something) are thrown and not logged.

Tests
=====

Test are written in Jasmine with coverage by Istanbul. The pretest script runs JSLint.

    npm test
    
I aim to maintain test coverage at 100%, since it is only a small project ;-)
