const NodeCache = require( "node-cache" );
const db = require("../common/db_hbase");

const { logger, to } = require("../common/utils");

const KEY_USERS = "users";

class CacheSingleton {
    

    static createInstance() {

        // Creation of the Cache
        this.dbUser = new db({
            family: 'C',
            primary: 'id',
            schema: 'onv_ocr_2',
            table: 'restKey',
            hbase: this.config.hbaseOptions
        });

        return new NodeCache(this.config.cacheOptions);
    }

    static on(type, callback) {
        this.dbUser.on(type, callback);
    }

    static setConfig(opt) {
        if (!this.config) this.config = opt;
    }

    static getInstance() {
        var self = this;
        if (!this.instance) {
            this.instance = this.createInstance();

            this.setUsers();

            // Main Event: on expiry, reset the data;
            this.instance.on("expired", function(key, value) {
                console.log("expired")
                switch (key) {
                    case KEY_USERS:
                        self.setUsers();
                    break;
                    default:
                        logger.error("The key in cache is not supported");
                    break;
                }
            });
        }
        return this.instance;
    }

    static setUsers() {

        async function wrapper(self) {
            let err;
            var users = {};
            let scanner = self.dbUser.scanner();

            [err] = await to(scanner.each(async function(err, user, done) {
                if (err) return err;
                try {
                    users[user.id] = user;
                    return done();
                } catch (exception) {
                    logger.error(exception);
                    return done(exception);
                }
                
            }));

            if (err) {
                logger.error("Cache on users (restKey table) failed to be updated.");
            } else {
                logger.info("Cache on users (restKey table) has been updated.");
            }
        
            scanner.clear();
        
            self.instance.set(KEY_USERS, users);
        }

        wrapper(this);
    }
}

module.exports = CacheSingleton;