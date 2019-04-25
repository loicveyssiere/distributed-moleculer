const NodeCache = require( "node-cache" );
const db = require("../common/db_hbase");

const { logger, to } = require("../common/utils");

const CacheSingleton = (function() {
    
    const dbUser = new db({
        family: 'C',
        primary: 'id',
        schema: 'onv_ocr_2',
        table: 'restKey'
    });
    const KEY_USERS = "users";

    var instance;
    var options

    function createInstance() {

        // Creation of the Cache
        return new NodeCache(options);
    }

    function setOptions(opt) {
        if (!options) options = opt;
    }

    function getInstance() {
        if (!instance) {
            instance = createInstance();
            
            setUsers();

            // Main Event: on expiry, reset the data;
            instance.on("expired", function(key, value) {
                console.log("EXPIRED")
                switch (key) {
                    case KEY_USERS:
                        setUsers();
                    break;
                    default:
                        logger.error("The key in cache is not supported");
                    break;
                }
            });
        }
        return instance;
    }

    async function setUsers() {

        var users = {};
        let scanner = dbUser.scanner();

        [err] = await to(scanner.each(async function(err, user, done) {
            if (err) return err;
            try {
                users[user.id] = user;
                return done();
            } catch (exception) {
                console.log(exception);
                return done(exception);
            }
            
        }));
    
        scanner.clear();
      
        instance.set(KEY_USERS, users);
    }

    return {
        getInstance: getInstance,
        setOptions: setOptions
    }
})();

module.exports = CacheSingleton;