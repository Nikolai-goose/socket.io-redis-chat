// Setup basic express server
const express = require('express');

const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { createClient } = require('redis');
const redisAdapter = require('@socket.io/redis-adapter');

console.log(111);
const pubClient = createClient({ host: process.env.REDIS_ENDPOINT, port: 6379 });
console.log(111);
const subClient = pubClient.duplicate();
io.adapter(redisAdapter(pubClient, subClient));

const Presence = require('./lib/presence');

const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    let addedUser = false;

    // when the client emits 'new message', this listens and executes
    socket.on('new message', (data) => {
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data,
        });
    });

    socket.conn.on('heartbeat', () => {
        if (!addedUser) {
            // Don't start upserting until the user has added themselves.
            return;
        }

        Presence.upsert(socket.id, {
            username: socket.username,
        });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', (username) => {
        if (addedUser) {
            return;
        }

        // we store the username in the socket session for this client
        socket.username = username;
        Presence.upsert(socket.id, {
            username: socket.username,
        });
        addedUser = true;

        Presence.list((users) => {
            socket.emit('login', {
                numUsers: users.length,
            });

            // echo globally (all clients) that a person has connected
            socket.broadcast.emit('user joined', {
                username: socket.username,
                numUsers: users.length,
            });
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', {
            username: socket.username,
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', {
            username: socket.username,
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {
            Presence.remove(socket.id);

            Presence.list((users) => {
                // echo globally (all clients) that a person has connected
                socket.broadcast.emit('user left', {
                    username: socket.username,
                    numUsers: users.length,
                });
            });
        }
    });
});
