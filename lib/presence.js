const redis = require('redis');

function Presence() {
    this.client = redis.createClient({
        host: process.env.REDIS_ENDPOINT,
    });
}
module.exports = new Presence();

/**
 * Remember a present user with their connection ID
 *
 * @param {string} connectionId - The ID of the connection
 * @param {object} meta - Any metadata about the connection
 * */
Presence.prototype.upsert = function (connectionId, meta) {
    this.client.hset(
        'presence',
        connectionId,
        JSON.stringify({
            meta: meta,
            when: Date.now(),
        }),
        (err) => {
            if (err) {
                console.error(`Failed to store presence in redis: ${err}`);
            }
        }
    );
};

/**
 * Remove a presence. Used when someone disconnects
 *
 * @param {string} connectionId - The ID of the connection
 * @param {object} meta - Any metadata about the connection
 * */
Presence.prototype.remove = function (connectionId) {
    this.client.hdel('presence', connectionId, (err) => {
        if (err) {
            console.error(`Failed to remove presence in redis: ${err}`);
        }
    });
};

/**
 * Returns a list of present users, minus any expired
 *
 * @param {function} returnPresent - callback to return the present users
 * */
Presence.prototype.list = function (returnPresent) {
    const active = [];
    const dead = [];
    const now = Date.now();
    const self = this;

    this.client.hgetall('presence', (err, presence) => {
        if (err) {
            console.error(`Failed to get presence from Redis: ${err}`);
            return returnPresent([]);
        }

        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const connection in presence) {
            const details = JSON.parse(presence[connection]);
            details.connection = connection;

            if (now - details.when > 8000) {
                dead.push(details);
            } else {
                active.push(details);
            }
        }

        if (dead.length) {
            // eslint-disable-next-line no-underscore-dangle
            self._clean(dead);
        }

        return returnPresent(active);
    });
};

/**
 * Cleans a list of connections by removing expired ones
 *
 * @param
 * */
// eslint-disable-next-line no-underscore-dangle
Presence.prototype._clean = function (toDelete) {
    console.log(`Cleaning ${toDelete.length} expired presences`);
    // eslint-disable-next-line no-restricted-syntax
    for (const presence of toDelete) {
        this.remove(presence.connection);
    }
};
