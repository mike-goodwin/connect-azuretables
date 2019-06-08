/*   Copyright 2016 Mike Goodwin

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

"use strict";

var azure = require('azure-storage');
var util = require('util');
var CronJob = require('cron').CronJob;

var DEFAULT_TABLE = 'ConnectAzureTablesSessions';
var RETRY_LIMIT = 3;
var RETRY_INTERVAL = 3000; //miliseconds

module.exports = function(session) {

    var Store = session.Store;

    function AzureTablesStore(options) {

        var self = this;

        options = options || {};
        self.log = options.logger || noop;
        self.logError = options.errorLogger ||noop;
        self.sessionTimeOut = options.sessionTimeOut;
        self.cronPattern = options.overrideCron || '59 * * * * *';
        
        Store.call(this, options);

        /* 
        storage account set up. azure-storage will attempt to read the following environment variables:
        AZURE_STORAGE_ACCOUNT
        AZURE_STORAGE_ACCESS_KEY
        or
        AZURE_STORAGE_CONNECTION_STRING
        if these are not found, storageAccount and accessKey
        must be supplied on options
        */

        //todo: allow retry policy to bet set on options
        var retryOperations = new azure.LinearRetryPolicyFilter(RETRY_LIMIT, RETRY_INTERVAL);
        var azureStorageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

        if (azureStorageConnectionString) {
            self.tableService = azure.createTableService().withFilter(retryOperations);
        }
        else {
            var storageAccount = process.env.AZURE_STORAGE_ACCOUNT || options.storageAccount;
            var accessKey = process.env.AZURE_STORAGE_ACCESS_KEY || options.accessKey;
            self.tableService = azure.createTableService(storageAccount, accessKey).withFilter(retryOperations);
        }

        /*
        table setup
        table name can be supplied on options
        */

        self.table = options.table || DEFAULT_TABLE;
        self.tableService.createTableIfNotExists(self.table, logOrThrow);
        
        //schedule expired session cleanup if session timeout is set
        if (options.sessionTimeOut) {
            self.startBackgroundCleanUp();
        }
        
        //reducing function complexity to keep code climate happy
        function logOrThrow(error, result) {

            if (result) {
                self.log('connect-azuretables created table ' + self.table);
            }

            if (error) {
                throw ('failed to create table: ' + error);
            }
        }
    }

    util.inherits(AzureTablesStore, Store);

    //all - optional function

    //destroy - required function
    AzureTablesStore.prototype.destroy = function(sid, fn) {
        var store = this;
        var cleanSid = sanitize(sid);
        var entGen = azure.TableUtilities.entityGenerator;
        var session = {
            PartitionKey: entGen.String(cleanSid),
            RowKey: entGen.String(cleanSid)
        };

        if (!fn) {
            fn = noop;
        }
        
        this.log('connect-azuretables called DESTROY ' + sid);

        store.tableService.deleteEntity(store.table, session, function(error, result) {
            return errorOrResult(error, result, fn);
        });
    };

    //clear - optional function

    //length - optional function

    //get - required function
    AzureTablesStore.prototype.get = function(sid, fn, retry) {
        var store = this;
        var cleanSid = sanitize(sid);
        
        if (!fn) {
            fn = noop;
        }
        
        this.log('connect-azuretables called GET ' + sid);

        store.tableService.retrieveEntity(store.table, cleanSid, cleanSid, function(error, result) {
            
            if (error && error.statusCode == 404) {
                if (!retry) {
                    //manual retry on 404 to avoid race condition when set is slow to callback
                    //github issue: https://github.com/mike-goodwin/connect-azuretables/issues/1
                    store.get(sid, fn, true);
                } else {
                    //Looks really unavaliable. Returns `undefined`.
                    return fn(null, undefined);
                }
            } else {
                return error || !result ? fn(error) : fn(null, JSON.parse(result.data._));
            }
        });
    };

    //set - required function
    AzureTablesStore.prototype.set = function(sid, data, fn) {
        this.update('SET', sid, data, fn);
    };

    //touch - optional function
    AzureTablesStore.prototype.touch = function(sid, data, fn) {
        this.update('TOUCH', sid, data, fn);
    };
    
    //updates a session
    AzureTablesStore.prototype.update = function(method, sid, data, fn) {
        this.log('connect-azuretables called ' + method + ' ' + sid);
        var store = this;
        var cleanSid = sanitize(sid);
        var entGen = azure.TableUtilities.entityGenerator;
        var session = {
            PartitionKey: entGen.String(cleanSid),
            RowKey: entGen.String(cleanSid),
            data: entGen.String(JSON.stringify(data))
        };
        
        var expiryDate = getExpiryDate(store, data);
        
        if (expiryDate) {
            session.expiryDate = entGen.DateTime(expiryDate);  
        }

        if (!fn) {
            fn = noop;
        }

        store.tableService.insertOrReplaceEntity(store.table, session, function(error, result) {
            
            if(!error) {
                store.startBackgroundCleanUp();
            }
            
            return errorOrResult(error, result, fn);
        });         
    };
    
    //start cron job
    AzureTablesStore.prototype.startBackgroundCleanUp = function() {

        if (!this.isRunningCleanUp) {

            var store = this;
            store.log('starting session cleanup cron job with cron pattern ' + store.cronPattern);
            new CronJob(store.cronPattern,
                function() {
                    store.cleanUp();
                },
                null,
                true);

            this.isRunningCleanUp = true;
        }
    };
    
    //remove timed out sessions from the store
    AzureTablesStore.prototype.cleanUp = function() {
        var query = new azure.TableQuery().where('expiryDate lt ?', new Date(Date.now()));
        var store = this;
        store.log('cleaning up expired sessions');
        getEntries(store.table, query, null);

        function getEntries(table, query, continuationToken) {
            store.tableService.queryEntities(table, query, continuationToken, function(error, result, response) {
                if (error) {
                    store.logError('Error when checking for expired sessions: ' + error);
                } else {
                    deleteEntries(result);
                }
            });
        }

        function deleteEntries(result) {
            result.entries.forEach(deleteEntry);

            if (result.continuationToken) {
                getEntries(store.table, query, result.continuationToken);
            }
        }

        function deleteEntry(entry) {
            store.tableService.deleteEntity(store.table, entry, function(error, result) {
                if (error) {
                    //404 probably means the session was already deleted
                    //either by a logout or by a clean up running on another server
                    if(error.statusCode != 404) {
                        store.logError('Error deleting session: ' + error);          
                    }         
                } else {
                    store.log('cleaned up session ' + entry.PartitionKey._);
                }
            });
        }

    };

    //ensure sid is suitable as a row key
    function sanitize(sid) {
        return sid.replace(/[^0-9A-Za-z]/g, '');
    }

    //no-op function
    function noop() {
    }

    //removing duplicate code to keep code climate happy
    function errorOrResult(error, result, fn) {
        return error ? fn(error) : fn(null, result);
    }
    
    //expiry date for sessions
    function getExpiryDate(store, data) {
        
        var offset;

        if (data.cookie.originalMaxAge) {
            offset = data.cookie.originalMaxAge;
        } else {
            offset = store.sessionTimeOut * 60000;
        }
        
        return offset ? new Date(Date.now() + offset) : null;
    }
    
    //export factory method instead of constructor for easier unit testing
    var factory = {
        create: function(options) {
            return new AzureTablesStore(options);
        }
    };

    return factory;
};