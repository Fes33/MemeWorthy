const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const app = express();
const port = 3000;
const http = require('http');
const socketIo = require('socket.io');
let apiFile = require("../env.json");
let apiKey = apiFile["api_key"];



let { Pool } = require("pg");
// make this script's dir the cwd
// b/c npm run start doesn't cd into src/ to run this
// and if we aren't in its cwd, all relative paths will break
process.chdir(__dirname);
let host;

async function logRandomPrompt() {
    try {
        // Get a random deck ID (1 to 3)
        const deckId = Math.floor(Math.random() * 3) + 1;

        // Query the database for a random prompt from the selected deck
        const result = await pool.query(`
            SELECT prompt
            FROM prompts
            WHERE deck_id = $1
            ORDER BY RANDOM()
            LIMIT 1
        `, [deckId]);

        if (result.rows.length > 0) {
            console.log(`Random Prompt from Deck ${deckId}: ${result.rows[0].prompt}`);
        } else {
            console.log(`No prompts found in Deck ${deckId}`);
        }
    } catch (error) {
        console.error('Error fetching random prompt:', error);
    }
}



let databaseConfig;
// fly.io sets NODE_ENV to production automatically, otherwise it's unset when running locally
if (process.env.NODE_ENV == "production") {
    host = "0.0.0.0";
    databaseConfig = { connectionString: process.env.DATABASE_URL };
} else {
    host = "localhost";
    let { PGUSER, PGPASSWORD, PGDATABASE, PGHOST, PGPORT } = process.env;
    databaseConfig = { PGUSER, PGPASSWORD, PGDATABASE, PGHOST, PGPORT };
}


app.use(express.static('public'));
app.use(express.json());


let pool = new Pool(databaseConfig);
pool.connect()
    .then(() => {
        console.log("Connected to the database");
        return logRandomPrompt(); // Log a random prompt after successful connection
    })
    .catch(err => {
        console.error('Couldn\'t connect to the database:', err);
    });



/*
let pool = new Pool(databaseConfig);
pool.connect().then(() => {
    console.log("Connected to db");
});
*/

let rooms = {};

let userSocketMap = {};

const server = http.createServer(app);
const io = socketIo(server);

const prompts = [
    "Pick a random GIF",
    "Pick a GIF of the day",
    "Pick a cat GIF"
];

app.post('/create-room', (req, res) => {
    let roomId = Math.floor(100000 + Math.random() * 900000).toString();
    let userId = uuidv4();
    let { username } = req.body;

    rooms[roomId] = {
        ownerId: userId,
        users: [{ userId, username }],
        gameState: {
            round: 0,
            submissions: {},
            submittedUsers: [], // Track which users have submitted in the current round
            votes: {},
        }
    };
    console.log(`Room ${roomId} created by ${username} (${userId})`);
    res.status(200).json({ roomId, userId });
});

app.post('/join-room', (req, res) => {
    let { roomId, username } = req.body;
    if (rooms[roomId]) {
        let userId = uuidv4();
        rooms[roomId].users.push({ userId, username });
        io.to(roomId).emit('user-joined', { userId, username });
        console.log(`${username} (${userId}) joined Room ${roomId}`);
        res.status(200).json({ userId, roomId });
    } else {
        res.status(404).send('Room not found');
    }
});

app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

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

app.post('/start-game', (req, res) => {
    let { roomId } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].gameState.round = 1;
        rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
        io.to(roomId).emit('game-started', { round: 1, prompt: prompts[0] });
        console.log(`Game started in Room ${roomId}, starting Round 1 with ${rooms[roomId].users.length} users.`);
        startRound1(roomId);
        res.status(200).send('Game started');
    } else {
        res.status(404).send('Room not found');
    }
});

// Start Round 1
function startRound1(roomId) {
    console.log(`Starting Round 1 for Room ${roomId}`);
    rooms[roomId].gameState.round = 1;
    rooms[roomId].gameState.submittedUsers = []; // Initialize or reset the submitted users list
    io.to(roomId).emit('start-round', { round: 1, prompt: prompts[0] });
}

// Handle Round 1 Submissions
function handleRound1Submission(roomId, userId, gifUrl) {
    let round = 1;
    if (!rooms[roomId].gameState.submissions[round]) {
        rooms[roomId].gameState.submissions[round] = {};
    }
    rooms[roomId].gameState.submissions[round][userId] = gifUrl;

    // Track that this user has submitted
    if (!rooms[roomId].gameState.submittedUsers.includes(userId)) {
        rooms[roomId].gameState.submittedUsers.push(userId);
    }

    console.log(`User ${userId} submitted a GIF for Round 1 in Room ${roomId}. Total submitted: ${rooms[roomId].gameState.submittedUsers.length}/${rooms[roomId].users.length}`);

    // Check if all users have submitted for this round
    if (rooms[roomId].gameState.submittedUsers.length === rooms[roomId].users.length) {
        console.log(`All users submitted for Round 1 in Room ${roomId}`);
        startRound2(roomId);
    }
}

// Start Round 2
function startRound2(roomId) {
    console.log(`Starting Round 2 for Room ${roomId}`);
    rooms[roomId].gameState.round = 2;
    rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
    //io.to(roomId).emit('start-round', { round: 2, prompt: prompts[1] }); //Rabib look at this
    io.to(roomId).emit('game-started', { round: 2, prompt: prompts[1] });
}

// Handle Round 2 Submissions
function handleRound2Submission(roomId, userId, gifUrl) {
    let round = 2;
    if (!rooms[roomId].gameState.submissions[round]) {
        rooms[roomId].gameState.submissions[round] = {};
    }
    rooms[roomId].gameState.submissions[round][userId] = gifUrl;

    // Track that this user has submitted
    if (!rooms[roomId].gameState.submittedUsers.includes(userId)) {
        rooms[roomId].gameState.submittedUsers.push(userId);
    }

    console.log(`User ${userId} submitted a GIF for Round 2 in Room ${roomId}. Total submitted: ${rooms[roomId].gameState.submittedUsers.length}/${rooms[roomId].users.length}`);

    // Check if all users have submitted for this round
    if (rooms[roomId].gameState.submittedUsers.length === rooms[roomId].users.length) {
        console.log(`All users submitted for Round 2 in Room ${roomId}`);
        startRound3(roomId);
    }
}

// Start Round 3
function startRound3(roomId) {
    console.log(`Starting Round 3 for Room ${roomId}`);
    rooms[roomId].gameState.round = 3;
    rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
    io.to(roomId).emit('start-round', { round: 3, prompt: prompts[2] });
}

// Handle Round 3 Submissions
function handleRound3Submission(roomId, userId, gifUrl) {
    let round = 3;
    if (!rooms[roomId].gameState.submissions[round]) {
        rooms[roomId].gameState.submissions[round] = {};
    }
    rooms[roomId].gameState.submissions[round][userId] = gifUrl;

    // Track that this user has submitted
    if (!rooms[roomId].gameState.submittedUsers.includes(userId)) {
        rooms[roomId].gameState.submittedUsers.push(userId);
    }

    console.log(`User ${userId} submitted a GIF for Round 3 in Room ${roomId}. Total submitted: ${rooms[roomId].gameState.submittedUsers.length}/${rooms[roomId].users.length}`);

    // Check if all users have submitted for this round
    if (rooms[roomId].gameState.submittedUsers.length === rooms[roomId].users.length) {
        console.log(`All users submitted for Round 3 in Room ${roomId}`);
        startVoting(roomId);
    }
}

// Start Voting Phase
function startVoting(roomId) {
    console.log(`Starting Voting for Room ${roomId}`);
    io.to(roomId).emit('voting-start', { submissions: rooms[roomId].gameState.submissions });
}

app.post('/submit-gif', (req, res) => {
    let { roomId, userId, gifUrl } = req.body;
    if (rooms[roomId]) {
        let round = rooms[roomId].gameState.round;
        switch (round) {
            case 1:
                handleRound1Submission(roomId, userId, gifUrl);
                break;
            case 2:
                handleRound2Submission(roomId, userId, gifUrl);
                break;
            case 3:
                handleRound3Submission(roomId, userId, gifUrl);
                break;
        }
        res.status(200).send('GIF submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

app.post('/submit-vote', (req, res) => {
    let { roomId, userId, votes } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].gameState.votes[userId] = votes;
        io.to(roomId).emit('vote-submitted', { userId });
        console.log(`User ${userId} submitted votes in Room ${roomId}`);

        // Check if all users have voted
        let allVoted = rooms[roomId].users.every(user => rooms[roomId].gameState.votes[user.userId]);

        if (allVoted) {
            console.log(`All users voted in Room ${roomId}. Calculating scores...`);
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
            console.log(`Game over in Room ${roomId}. Final scores sent.`);
        }

        res.status(200).send('Vote submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

app.get('/search-giphy', async (req, res) => {
    let { query } = req.query;
    try {
        let response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: apiKey,
                q: query,
                limit: 10
            }
        });
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).send('Error searching Giphy');
    }
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join-room', ({ roomId, userId }) => {
        socket.join(roomId);
        userSocketMap[socket.id] = { roomId, userId };
    });

    socket.on('chat-message', (data) => {
        io.to(data.roomId).emit('chat-message', { username: data.userId, message: data.message });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        let { roomId, userId } = userSocketMap[socket.id];
        if (roomId && rooms[roomId]) {
            let room = rooms[roomId];
            room.users = room.users.filter(user => user.userId !== userId);
            io.to(roomId).emit('user-left', { userId });
            console.log(`User ${userId} left Room ${roomId}`);

            if (room.users.length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted as all users have left`);
            }
        }
        delete userSocketMap[socket.id];
    });
});

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
// server.listen(port, () => {
//     console.log(`Server is running on http://localhost:${port}`);
// });
