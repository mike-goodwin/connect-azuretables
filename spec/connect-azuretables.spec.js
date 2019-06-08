'use strict';

var mockery = require('mockery');
var moduleUnderTest = '../lib/connect-azuretables';
var session = require('express-session');
var sinon = require('sinon');

//azure-storage mock
var mockTableService = {};
mockTableService.createTableService = function() { };
mockTableService.withFilter = function() { return this; };
mockTableService.createTableIfNotExists = function() { };
mockTableService.queryEntities = function() { };
mockTableService.deleteEntity = function() { };

//entityGeneratorMock
var mockEntGen = {};
mockEntGen.String = function(value) { return value; }
mockEntGen.Int64 = function(value) { return value; }
mockEntGen.Int32 = function(value) { return value; }
mockEntGen.DateTime = function(value) { return value; }
mockEntGen.Boolean = function(value) { return value; }

//azure-storage mock
var mockAzureStorage = {};
mockAzureStorage.createTableService = function() { return mockTableService; };
mockAzureStorage.LinearRetryPolicyFilter = function() { };
mockAzureStorage.TableUtilities = { entityGenerator: mockEntGen };
mockAzureStorage.TableQuery = function() {
    this.where = function() {};
};
mockery.registerMock('azure-storage', mockAzureStorage);

var AzureTablesStoreFactory;

beforeEach(function() {

    mockery.enable({
        useCleanCache: true,
        warnOnUnregistered: false,
        warnOnReplace: false
    });

    AzureTablesStoreFactory = require(moduleUnderTest)(session);

});

afterEach(function() {

    mockery.disable();

});

describe('initialisation tests: ', function() {

    it('should inherit from the session Store', function() {

        var options = { storageAccount: 'account', accessKey: 'key' };
        expect(AzureTablesStoreFactory.create(options) instanceof session.Store).toBe(true);

    });

    it('should create table service using the supplied connection values', function() {

        var options = { storageAccount: 'account', accessKey: 'key' };
        spyOn(mockAzureStorage, 'createTableService').and.callThrough();
        AzureTablesStoreFactory.create(options);
        expect(mockAzureStorage.createTableService).toHaveBeenCalled();
        expect(mockAzureStorage.createTableService.calls.argsFor(0)).toEqual([options.storageAccount, options.accessKey]);
    });

    it('should create table service using the connection string in the environment variables', function() {

        var options = { storageAccount: 'account', accessKey: 'key' };
        process.env.AZURE_STORAGE_CONNECTION_STRING = 'connection string';
        spyOn(mockAzureStorage, 'createTableService').and.callThrough();
        AzureTablesStoreFactory.create(options);
        expect(mockAzureStorage.createTableService).toHaveBeenCalled();
        expect(mockAzureStorage.createTableService.calls.argsFor(0)).toEqual([]);
    });

    it('should create table service using the account/key in the environment variables', function() {

        process.env.AZURE_STORAGE_ACCOUNT = 'account';
        process.env.AZURE_STORAGE_ACCESS_KEY = 'key';
        spyOn(mockAzureStorage, 'createTableService').and.callThrough();
        AzureTablesStoreFactory.create();
        expect(mockAzureStorage.createTableService).toHaveBeenCalled();
        expect(mockAzureStorage.createTableService.calls.argsFor(0)).toEqual([]);
    });

    it('should create the default table', function() {

        var options = { storageAccount: 'account', accessKey: 'key' };
        spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
        AzureTablesStoreFactory.create(options);
        expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();
        expect(mockTableService.createTableIfNotExists.calls.argsFor(0)[0]).toEqual('ConnectAzureTablesSessions');

    });

    it('should override the default table name', function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
        AzureTablesStoreFactory.create(options);
        expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();
        expect(mockTableService.createTableIfNotExists.calls.argsFor(0)[0]).toEqual('table');

    });

    it('should error on table creation', function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        var error = 'table error';

        mockTableService.createTableIfNotExists = function(table, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
        expect(function() { AzureTablesStoreFactory.create(options); }).toThrow();
        expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();

    });

    it('should not error on table creation', function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };

        mockTableService.createTableIfNotExists = function(table, cb) {
            cb(null, true);
        };

        spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
        expect(function() { AzureTablesStoreFactory.create(options); }).not.toThrow();
        expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();

    });
    
    describe('session clean up cron tests', function() {

        var clock;
        
        beforeEach(function() { 
            clock = sinon.useFakeTimers();
        });
        
        afterEach(function() {
            clock.restore(); 
        });
        
        it('should not clean up sessions', function() {
            
            var options = { storageAccount: 'account', accessKey: 'key'};
            var store = AzureTablesStoreFactory.create(options);
            spyOn(store, 'cleanUp');
            clock.tick(61000);
            expect(store.cleanUp).not.toHaveBeenCalled();
        });

        it('should clean up sessions (default cron)', function() {

            var options = { 
                storageAccount: 'account', 
                accessKey: 'key', 
                sessionTimeOut: 30
            };

            var store = AzureTablesStoreFactory.create(options);
            spyOn(store, 'cleanUp').and.callThrough();
            expect(store.cleanUp).not.toHaveBeenCalled();
            clock.tick(61000);
            expect(store.cleanUp).toHaveBeenCalled();
        });
        
        it('should clean up sessions (cron override)', function() {

            var options = { 
                storageAccount: 'account', 
                accessKey: 'key', 
                sessionTimeOut: 30,
                overrideCron: '*/12 * * * * *'
            };

            var store = AzureTablesStoreFactory.create(options);
            spyOn(store, 'cleanUp').and.callThrough();
            expect(store.cleanUp).not.toHaveBeenCalled();
            clock.tick(13000);
            expect(store.cleanUp).toHaveBeenCalled();
        });
        
        it('should clean up sessions on first set only', function() {

            var options = { storageAccount: 'account', accessKey: 'key' };
            var store = AzureTablesStoreFactory.create(options);
            spyOn(store, 'cleanUp');
            clock.tick(61000);
            expect(store.cleanUp).not.toHaveBeenCalled();
            var sid = 'sidforsetting';
            var session = { value: 'session value', cookie: { maxAge: 600000 } };
            var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session) };
            
            mockTableService.insertOrReplaceEntity = function(table, session, cb) {
                cb();
            };

            spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
            store.set(sid, session);
            clock.tick(61000);
            expect(store.cleanUp).toHaveBeenCalled();
            store.set(sid, session);
            expect(store.cleanUp.calls.count()).toEqual(1);
        });
    });    
});

describe('session clean up tests', function() {
    
    it('should find no sessions to delete', function() {
        
        var mockLogger = { log: function() {  } };

        spyOn(mockLogger,'log');
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(null, {entries: []});
        });
        
        spyOn(mockTableService, 'deleteEntity');
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log
        };

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(2);
        expect(mockTableService.deleteEntity).not.toHaveBeenCalled();
    });
    
    it('should construct the correct query', function() {
        
        //not sure how to do this because of difficulty mocking TableQuery
                
    });
    
    it('should log an error when fetching entities', function() {
        
        var mockLogger = { log: function() { } };
        spyOn(mockLogger, 'log');
        var error = 'query entities error';
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(error, null);
        });
        
        spyOn(mockTableService, 'deleteEntity');
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            errorLogger: mockLogger.log
        };

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.argsFor(0)[0].indexOf(error) >= 0).toBe(true);
        expect(mockTableService.deleteEntity).not.toHaveBeenCalled();
    });
    
    it('should not log a 404 error when deleting entries', function() {
        
        var mockLogger = { log: function(message) {
            
         } };
        spyOn(mockLogger,'log').and.callThrough();;
        var mockErrorLogger = { log: function(message) { } };
        spyOn(mockErrorLogger,'log');
        
        var result = {entries: [{PartitionKey: 1}, {PartitionKey: 2}, {PartitionKey: 3}]};
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(null, result);
         });
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log,
            errorLogger: mockErrorLogger.log
        };
        
        var error = {statusCode: 404, message: 'delete error'};
        spyOn(mockTableService, 'deleteEntity').and.callFake(function(table, entry, cb) {
            cb(error, 0);
        });

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(2);
        expect(mockErrorLogger.log).not.toHaveBeenCalled();
        expect(mockTableService.deleteEntity.calls.count()).toEqual(3);

    });
    
    it('should log an error when deleting entries', function() {
        
        var mockLogger = { log: function(message) {
            
         } };
        spyOn(mockLogger,'log').and.callThrough();;
        var mockErrorLogger = { log: function(message) { } };
        spyOn(mockErrorLogger,'log');
        
        var result = {entries: [{PartitionKey: 1}, {PartitionKey: 2}, {PartitionKey: 3}]};
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(null, result);
         });
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log,
            errorLogger: mockErrorLogger.log
        };
        
        var error = 'delete error';
        spyOn(mockTableService, 'deleteEntity').and.callFake(function(table, entry, cb) {
            cb(error, 0);
        });

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(2);
        expect(mockErrorLogger.log.calls.count()).toEqual(3);
        expect(mockErrorLogger.log.calls.argsFor(0)[0].indexOf(error) >= 0).toBe(true);
        expect(mockErrorLogger.log.calls.argsFor(1)[0].indexOf(error) >= 0).toBe(true);
        expect(mockErrorLogger.log.calls.argsFor(2)[0].indexOf(error) >= 0).toBe(true);
        expect(mockTableService.deleteEntity.calls.count()).toEqual(3);

    });
        
    it('should fetch entities with a single query', function() {
        
        var mockLogger = { log: function(message) { } };
        spyOn(mockLogger,'log');
        
        var result = {entries: [{PartitionKey: 1}, {PartitionKey: 2}, {PartitionKey: 3}]};
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(null, result);
         });
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log
        };
        
        spyOn(mockTableService, 'deleteEntity').and.callFake(function(table, entry, cb) {
            cb(null, 'delete result');
        });

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(5);
        expect(mockTableService.deleteEntity.calls.count()).toEqual(3);
        
    });
    
    it('should fetch entities with a single query', function() {
        
        var mockLogger = { log: function(message) { } };
        spyOn(mockLogger,'log');
        
        var result = {entries: [{PartitionKey: 1}, {PartitionKey: 2}, {PartitionKey: 3}]};
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            cb(null, result);
         });
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log
        };
        
        spyOn(mockTableService, 'deleteEntity').and.callFake(function(table, entry, cb) {
            cb(null, 'delete result');
        });

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(1);
        expect(mockLogger.log.calls.count()).toEqual(5);
        expect(mockTableService.deleteEntity.calls.count()).toEqual(3);
        
    });
    
    it('should fetch entities with a two queries', function() {
        
        var mockLogger = { log: function() { } };
        spyOn(mockLogger,'log');
        
        var result = {entries: [{PartitionKey: 1}, {PartitionKey: 2}, {PartitionKey: 3}]};
        spyOn(mockTableService, 'queryEntities').and.callFake(function(table, query, token, cb) {
            var resultToSend = result;
            
            if (!token) {
                resultToSend.continuationToken = true;
            } else {
                delete resultToSend.continuationToken;
            }
            
            cb(null, resultToSend)
         });
        
        var options = {
            storageAccount: 'account',
            accessKey: 'key',
            logger: mockLogger.log
        };
        
        spyOn(mockTableService, 'deleteEntity').and.callFake(function(table, entry, cb) {
            cb(null, 'delete result');
        });

        var store = AzureTablesStoreFactory.create(options);
        store.cleanUp();
        expect(mockTableService.queryEntities.calls.count()).toEqual(2);
        expect(mockLogger.log.calls.count()).toEqual(8);
        expect(mockTableService.deleteEntity.calls.count()).toEqual(6);
        
    }); 
});

describe('destroy tests: ', function() {

    var azureTablesStore;
    var sid = 'sidfordeletion';
    var handler = {};
    handler.callBack = function() { };

    beforeEach(function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

   });

    it('should destroy the specified session', function() {

        mockTableService.deleteEntity = function(table, session, cb) {
            cb(null);
        };
        spyOn(mockTableService, 'deleteEntity').and.callThrough();
        azureTablesStore.destroy(sid);
        expect(mockTableService.deleteEntity).toHaveBeenCalled();
        expect(mockTableService.deleteEntity.calls.argsFor(0)[1]).toEqual({ PartitionKey: sid, RowKey: sid });

    });

    it('should destroy the specified session and call back', function() {

        var result = 'delete result';

        mockTableService.deleteEntity = function(table, session, cb) {
            cb(null, result);
        };

        spyOn(mockTableService, 'deleteEntity').and.callThrough();
        azureTablesStore.destroy(sid, handler.callBack);
        expect(mockTableService.deleteEntity).toHaveBeenCalled();
        expect(mockTableService.deleteEntity.calls.argsFor(0)[1]).toEqual({ PartitionKey: sid, RowKey: sid });
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([null, result]);

    });

    it('should error when destroying the session', function() {

        var error = 'delete error';

        mockTableService.deleteEntity = function(table, session, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'deleteEntity').and.callThrough();
        azureTablesStore.destroy(sid, handler.callBack);
        expect(mockTableService.deleteEntity).toHaveBeenCalled();
        expect(mockTableService.deleteEntity.calls.argsFor(0)[1]).toEqual({ PartitionKey: sid, RowKey: sid });
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([error]);

    });

});

describe('get tests: ', function() {

    var azureTablesStore;
    var sid = 'sidforgetting';
    var handler = {};
    handler.callBack = function() { };

    beforeEach(function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

    });

    it('should get the specified session', function() {

        mockTableService.retrieveEntity = function() { };

        spyOn(mockTableService, 'retrieveEntity').and.callThrough();
        azureTablesStore.get(sid);
        expect(mockTableService.retrieveEntity).toHaveBeenCalled();
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[1]).toEqual(sid);
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[2]).toEqual(sid);
    });

    it('should get the specified session and call back', function() {

        var session = { value: 'get result' };
        var entity = { data: { _: JSON.stringify(session) } };

        mockTableService.retrieveEntity = function(table, partitionKey, rowKey, cb) {
            cb(null, entity);
        };

        spyOn(mockTableService, 'retrieveEntity').and.callThrough();
        azureTablesStore.get(sid, handler.callBack);
        expect(mockTableService.retrieveEntity).toHaveBeenCalled();
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[1]).toEqual(sid);
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[2]).toEqual(sid);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([null, session]);

    });

    it('should error when getting the session', function() {

        var error = 'get error';

        mockTableService.retrieveEntity = function(table, partitionKey, rowKey, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'retrieveEntity').and.callThrough();
        azureTablesStore.get(sid, handler.callBack);
        expect(mockTableService.retrieveEntity).toHaveBeenCalled();
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[1]).toEqual(sid);
        expect(mockTableService.retrieveEntity.calls.argsFor(0)[2]).toEqual(sid);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([error]);

    });
    
    it('should retry on 404 error', function() {

        var error = {statusCode: 404};

        mockTableService.retrieveEntity = function(table, partitionKey, rowKey, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'retrieveEntity').and.callThrough();
        azureTablesStore.get(sid, handler.callBack);
        expect(mockTableService.retrieveEntity.calls.count()).toEqual(2);
        expect(handler.callBack.calls.argsFor(0)).toEqual([null, undefined]);

    });

});

describe('set tests: ', function() {

    var azureTablesStore;
    var sid = 'sidforsetting';
    var session = { value: 'session value', cookie: {} };
    var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session) };
    var handler = {};
    handler.callBack = function() { };

    beforeEach(function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

    });

    it('should set the specified session', function() {

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb();
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.set(sid, session);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
    });

    it('should set the specified session and call back', function() {

        var result = 'set result';

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb(null, result);
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.set(sid, session, handler.callBack);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([null, result]);

    });

    it('should error when setting the session', function() {

        var error = 'set error';

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.set(sid, session, handler.callBack);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([error]);
 
    });
});

describe('touch tests with no maxAge or sessionTimeout: ', function() {

    var azureTablesStore;
    var sid = 'sidforTouching';
    var session = { value: 'session value', cookie: {} };
    var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session)};
    var handler = {};
    handler.callBack = function() { };

    beforeEach(function() {

        var options = { storageAccount: 'account', accessKey: 'key', table: 'table' };
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

    });

    it('should touch the specified session', function() {

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb();
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.touch(sid, session);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
    });

    it('should touch the specified session and call back', function() {

        var result = 'touch result';

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb(null, result);
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.touch(sid, session, handler.callBack);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([null, result]);

    });

    it('should error when touching the session', function() {

        var error = 'touch error';

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb(error);
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        azureTablesStore.touch(sid, session, handler.callBack);
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
        expect(handler.callBack).toHaveBeenCalled();
        expect(handler.callBack.calls.argsFor(0)).toEqual([error]);
    });
});

describe('touch tests with sessionTimeout or maxAge: ', function() {

    var azureTablesStore;
    var sid = 'sidforTouching';
    var handler = {};
    handler.callBack = function() { };

    it('should set the session expiry from the session timeout', function() {

        var timeOut = 60000 //miliseconds
        var session = { value: 'session value', cookie: {} };
        var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session)};
        var options = { storageAccount: 'account', accessKey: 'key', table: 'table', sessionTimeOut: timeOut/60000 };
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb();
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        var baseTime = 1000;
        var clock = sinon.useFakeTimers(baseTime);
        var touchedEntity = entity;
        touchedEntity.expiryDate = new Date(timeOut + baseTime);
        azureTablesStore.touch(sid, session);
        clock.restore();
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(touchedEntity);
    });
    
    it('should set the session expiry from maxAge', function() {

        var timeOut = 30000;
        var session = { value: 'session value', cookie: {originalMaxAge: timeOut} };
        var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session)};
        var options = { storageAccount: 'account', accessKey: 'key', table: 'table'};
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb();
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        var baseTime = 1000;
        var clock = sinon.useFakeTimers(baseTime);
        var touchedEntity = entity;
        touchedEntity.expiryDate = new Date(timeOut + baseTime);
        azureTablesStore.touch(sid, session);
        clock.restore();
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(touchedEntity);
    });

    it('should set the session expiry from maxAge and ignore session timeout', function() {

        var session = { value: 'session value', cookie: {originalMaxAge: 60000} };
        var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session)};
        var options = { storageAccount: 'account', accessKey: 'key', table: 'table', sessionTimeOut: 2};
        azureTablesStore = AzureTablesStoreFactory.create(options);
        spyOn(handler, 'callBack');

        mockTableService.insertOrReplaceEntity = function(table, session, cb) {
            cb();
        };

        spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
        var baseTime = 1000;
        var timeOut = 60000;
        var clock = sinon.useFakeTimers(baseTime);
        var touchedEntity = entity;
        touchedEntity.expiryDate = new Date(timeOut + baseTime);
        azureTablesStore.touch(sid, session);
        clock.restore();
        expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
        expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(touchedEntity);
    });
});

describe('logging tests', function() {

    var logger = {};
    logger.logFn = function() { };

    beforeEach(function() {

        spyOn(logger, 'logFn');

    });

    describe('initialisation tests: ', function() {

        it('should create the default table', function() {

            var options = { storageAccount: 'account', accessKey: 'key', logger: logger.logFn };
            spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
            AzureTablesStoreFactory.create(options);
            expect(logger.logFn).toHaveBeenCalled();
            expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();
            expect(mockTableService.createTableIfNotExists.calls.argsFor(0)[0]).toEqual('ConnectAzureTablesSessions');

        });

        it('should override the default table name', function() {

            var options = { storageAccount: 'account', accessKey: 'key', table: 'test table', logger: logger.logFn };
            spyOn(mockTableService, 'createTableIfNotExists').and.callThrough();
            AzureTablesStoreFactory.create(options);
            expect(mockTableService.createTableIfNotExists).toHaveBeenCalled();
            expect(mockTableService.createTableIfNotExists.calls.argsFor(0)[0]).toEqual('test table');
            expect(logger.logFn.calls.argsFor(0)[0].indexOf('test table') >= 0).toBe(true);

        });
    });

    describe('destroy tests: ', function() {

        var azureTablesStore;
        var sid = 'sidfordeletion';
        var handler = {};
        handler.callBack = function() { };

        beforeEach(function() {

            var options = { storageAccount: 'account', accessKey: 'key', table: 'table', logger: logger.logFn };
            azureTablesStore = AzureTablesStoreFactory.create(options);
            spyOn(handler, 'callBack');

        });

        it('should destroy the specified session', function() {

            mockTableService.deleteEntity = function(table, session, cb) {
                cb(null);
            };
            spyOn(mockTableService, 'deleteEntity').and.callThrough();
            azureTablesStore.destroy(sid);
            expect(mockTableService.deleteEntity).toHaveBeenCalled();
            expect(mockTableService.deleteEntity.calls.argsFor(0)[1]).toEqual({ PartitionKey: sid, RowKey: sid });
            expect(logger.logFn.calls.argsFor(1)[0].indexOf('DESTROY') >= 0).toBe(true);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf(sid) >= 0).toBe(true);
        });
    });

    describe('get tests: ', function() {

        var azureTablesStore;
        var sid = 'sidforgetting';
        var handler = {};
        handler.callBack = function() { };

        beforeEach(function() {

            var options = { storageAccount: 'account', accessKey: 'key', table: 'table', logger: logger.logFn };
            azureTablesStore = AzureTablesStoreFactory.create(options);
            spyOn(handler, 'callBack');

        });

        it('should get the specified session', function() {

            mockTableService.retrieveEntity = function() { };

            spyOn(mockTableService, 'retrieveEntity').and.callThrough();
            azureTablesStore.get(sid);
            expect(mockTableService.retrieveEntity).toHaveBeenCalled();
            expect(mockTableService.retrieveEntity.calls.argsFor(0)[1]).toEqual(sid);
            expect(mockTableService.retrieveEntity.calls.argsFor(0)[2]).toEqual(sid);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf('GET') >= 0).toBe(true);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf(sid) >= 0).toBe(true);
        });
    });

    describe('set tests: ', function() {

        var azureTablesStore;
        var sid = 'sidforsetting';
        var session = { value: 'session value', cookie: {} };
        var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session) };
        var handler = {};
        handler.callBack = function() { };

        beforeEach(function() {

            var options = { storageAccount: 'account', accessKey: 'key', table: 'table', logger: logger.logFn };
            azureTablesStore = AzureTablesStoreFactory.create(options);
            spyOn(handler, 'callBack');

        });

        it('should log setting the session', function() {

            mockTableService.insertOrReplaceEntity = function(table, session, cb) {
                cb();
            };

            spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
            azureTablesStore.set(sid, session);
            expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
            expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf('SET') >= 0).toBe(true);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf(sid) >= 0).toBe(true);
        });
    });

    describe('touch tests: ', function() {

        var azureTablesStore;
        var sid = 'sidforTouching';
        var session = { value: 'session value', cookie: {} };
        var entity = { PartitionKey: sid, RowKey: sid, data: JSON.stringify(session)};
        var handler = {};
        handler.callBack = function() { };

        beforeEach(function() {

            var options = { storageAccount: 'account', accessKey: 'key', table: 'table', logger: logger.logFn };
            azureTablesStore = AzureTablesStoreFactory.create(options);
            spyOn(handler, 'callBack');

        });

        it('should log touching the session', function() {

            mockTableService.insertOrReplaceEntity = function(table, session, cb) {
                cb();
            };

            spyOn(mockTableService, 'insertOrReplaceEntity').and.callThrough();
            azureTablesStore.touch(sid, session);
            expect(mockTableService.insertOrReplaceEntity).toHaveBeenCalled();
            expect(mockTableService.insertOrReplaceEntity.calls.argsFor(0)[1]).toEqual(entity);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf('TOUCH') >= 0).toBe(true);
            expect(logger.logFn.calls.argsFor(1)[0].indexOf(sid) >= 0).toBe(true);
        });
    });
});