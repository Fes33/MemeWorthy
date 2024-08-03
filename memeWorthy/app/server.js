const express = require('express');
const { v4: uuidv4 } = require('uuid'); //used to generate user IDs
const axios = require('axios'); //used for Giphy API
const app = express();
const port = 3000;
const http = require('http');
const socketIo = require('socket.io'); //used for live updates

app.use(express.static('public'));
app.use(express.json());

let rooms = {}; //stores active rooms and its details

//socketio variables
const server = http.createServer(app); 
const io = socketIo(server);

//Post requests creates a room and adds the creator
app.post('/create-room', (req, res) => {
    let roomId = Math.floor(100000 + Math.random() * 900000).toString(); //generate 6-digit room ID
    let userId = uuidv4(); //generate a userId for this person
    let { username } = req.body; //grab username from request body

    //add the room and the creator to the rooms object
    rooms[roomId] = {
        ownerId: userId,
        users: [{ userId, username }],
        gameState: {
            round: 0,
            submissions: {},
            votes: {},
        }
    };
    res.status(200).json({ roomId, userId });
});

//Post requests to add user that joined the room
app.post('/join-room', (req, res) => {
    let { roomId, username } = req.body; //get roomID and user's username from request body
    if (rooms[roomId]) { //if this room exists and is in the object of active rooms
        let userId = uuidv4(); //generate a userId for this person
        rooms[roomId].users.push({ userId, username }); //push the user ID and username of the user into the list of users of that room

        //sends to all clients connected to that particular room the json for the current user.
        io.to(roomId).emit('user-joined', { userId, username });

        res.status(200).json({ userId, roomId }); //return the new userID and roomID
    } else {
        res.status(404).send('Room not found');
    }
});

//Request handler to serve room HTML
app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

//Request to get room info as a json
app.get('/room-info/:roomId', (req, res) => {
    let roomId = req.params.roomId;
    if (rooms[roomId]) {
        res.status(200).json({
            ownerId: rooms[roomId].ownerId,
            users: rooms[roomId].users
        });
    } else {
        res.status(404).send('Room not found');
    }
});

//Start game handler
app.post('/start-game', (req, res) => {
    let { roomId } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].gameState.round = 1;
        io.to(roomId).emit('game-started', { round: 1, prompt: "Pick a cat GIF" });
        res.status(200).send('Game started');
    } else {
        res.status(404).send('Room not found');
    }
});

//Submit GIF handler
app.post('/submit-gif', (req, res) => {
    let { roomId, userId, gifUrl } = req.body;
    if (rooms[roomId]) {
        let round = rooms[roomId].gameState.round;
        if (!rooms[roomId].gameState.submissions[round]) {
            rooms[roomId].gameState.submissions[round] = {};
        }
        rooms[roomId].gameState.submissions[round][userId] = gifUrl;
        io.to(roomId).emit('gif-submitted', { userId, gifUrl });

        // Check if all users have submitted for the current round
        let allSubmitted = rooms[roomId].users.every(user => rooms[roomId].gameState.submissions[round][user.userId]);
        if (allSubmitted) {
            rooms[roomId].gameState.round++;
            let nextPrompt;
            switch (rooms[roomId].gameState.round) {
                case 2:
                    nextPrompt = "Pick a dog GIF";
                    break;
                case 3:
                    nextPrompt = "Pick a funny GIF";
                    break;
                default:
                    io.to(roomId).emit('voting-start', { submissions: rooms[roomId].gameState.submissions });
                    return res.status(200).send('GIF submitted');
            }
            io.to(roomId).emit('next-round', { round: rooms[roomId].gameState.round, prompt: nextPrompt });
        }
        res.status(200).send('GIF submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

//Submit Vote handler
app.post('/submit-vote', (req, res) => {
    let { roomId, userId, votes } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].gameState.votes[userId] = votes;
        io.to(roomId).emit('vote-submitted', { userId });

        // Check if all users have voted
        let allVoted = rooms[roomId].users.every(user => rooms[roomId].gameState.votes[user.userId]);
        if (allVoted) {
            // Calculate scores
            let scores = {};
            rooms[roomId].users.forEach(user => {
                scores[user.userId] = 0;
            });
            Object.values(rooms[roomId].gameState.votes).forEach(userVotes => {
                Object.entries(userVotes).forEach(([userId, score]) => {
                    scores[userId] += score;
                });
            });
            io.to(roomId).emit('game-over', { scores });
        }
        res.status(200).send('Vote submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

//Giphy search handler
app.get('/search-giphy', async (req, res) => {
    let { query } = req.query;
    try {
        let response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: '7Ot0pWNV26nL9CotyS1FWNS94pZXDuOH',
                q: query,
                limit: 10
            }
        });
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).send('Error searching Giphy');
    }
});

//Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
