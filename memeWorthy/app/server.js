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

// function for debugging
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

//this object holds the active rooms, their information and game state
let rooms = {};

let userSocketMap = {};

const server = http.createServer(app);
const io = socketIo(server);

const prompts = [
    "Pick a random GIF",
    "Pick a GIF of the day",
    "Pick a cat GIF"
];

//post request hanlder to create a room
app.post('/create-room', (req, res) => {
    let roomId = Math.floor(100000 + Math.random() * 900000).toString();
    let userId = uuidv4();
    let { username } = req.body;

    let deck = Math.floor(Math.random() * 3) + 1;
    rooms[roomId] = {
        ownerId: userId,
        users: [{ userId, username }],
        maxPlayers: 5, // Default Max
        maxRound: 3,
        gameState: {
            deck: deck,
            round: 0,
            useCustomDeck: false,
            submissions: {},
            roundPrompts: {},
            submittedUsers: [], // Track which users have submitted in the current round
            votes: {},
        }
    };
    console.log(`Room ${roomId} created by ${username} (${userId})`);
    res.status(200).json({ roomId, userId });
});

//post request handler for setting max players
app.post('/set-max-players', (req, res) => {
    let { roomId, maxPlayers } = req.body;
    if (rooms[roomId]) {
        //valid number
        if (maxPlayers >= rooms[roomId].users.length) {
            rooms[roomId].maxPlayers = maxPlayers;
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: 'Max players cannot be less than current number of users' });
        }
    } else {
        res.status(404).send('Room not found');
    }
});

//post request handler to join a room
app.post('/join-room', (req, res) => {
    let { roomId, username } = req.body;
    //check if the room is valid
    if (rooms[roomId]) {
        //check if the game has started
        if(rooms[roomId].gameState.round == 1){
            res.status(403).send('Game has already started in this room.');
        }
        else{
            //check if room full
            if (rooms[roomId].users.length < rooms[roomId].maxPlayers) {
                let userId = uuidv4();
                rooms[roomId].users.push({ userId, username });
                io.to(roomId).emit('user-joined', { userId, username });
                console.log(`${username} (${userId}) joined Room ${roomId}`);
                res.status(200).json({ userId, roomId });
            } else {
                res.status(403).send('Room is full');
            }
        }
        
    } else {
        res.status(404).send('Room not found');
    }
});

//serve the room.html
app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

//gives room information, usefull for debugging
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

//post request handler to start the game
app.post('/start-game', (req, res) => {
    let { roomId, useCustomPrompt, customPrompts, username, deckName, useUserCreatedDeck, deckId, maxRound } = req.body;

    if (rooms[roomId]) {
        rooms[roomId].gameState.round = 1;
        rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
        rooms[roomId].maxRound = maxRound;
        
        //if game is started using a user-created deck, query the customPrompt table for that deck
        if (useUserCreatedDeck) {
            rooms[roomId].gameState.useCustomDeck = true;
            rooms[roomId].gameState.deck = deckId; // Use the selected user-created deck

            pool.query(`
                SELECT prompt
                FROM customPrompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId])
            .then(result => {
                if (result.rows.length > 0) {
                    io.to(roomId).emit('game-started', { round: 1, prompt: result.rows[0].prompt });
                    rooms[roomId].gameState.roundPrompts[1] = result.rows[0].prompt;
                    console.log(`Game started in Room ${roomId} with User-Created Deck #${deckId}, starting Round 1 with ${rooms[roomId].users.length} users.`);
                } else {
                    console.error(`No prompts found for User-Created Deck #${deckId} in Room ${roomId}`);
                }
                startRound1(roomId);
                res.status(200).send('Game started with user-created deck');
            })
            .catch(error => {
                console.error('Error fetching prompt from the user-created deck:', error);
                res.status(500).send('Failed to start the game with user-created deck');
            });
        //if instead its a new deck with prompts made by the user, create that deck.
        } else if (useCustomPrompt) {
            rooms[roomId].gameState.useCustomDeck = true;

            // Insert the custom deck into customDecks table
            pool.query(`
                INSERT INTO customDecks (name, creator)
                VALUES ($1, $2)
                RETURNING id
            `, [deckName, username])
            .then(result => {
                const customDeckId = result.rows[0].id;
                const promptInserts = customPrompts.map(prompt => {
                    return pool.query(`
                        INSERT INTO customPrompts (deck_id, prompt)
                        VALUES ($1, $2)
                    `, [customDeckId, prompt]);
                });

                return Promise.all(promptInserts).then(() => customDeckId);
            })
            .then(customDeckId => {
                rooms[roomId].gameState.deck = customDeckId; // Assign custom deck ID to the room
                return pool.query(`
                    SELECT prompt
                    FROM customPrompts
                    WHERE deck_id = $1
                    ORDER BY RANDOM()
                    LIMIT 1
                `, [customDeckId]);
            })
            .then(result => {
                if (result.rows.length > 0) {
                    io.to(roomId).emit('game-started', { round: 1, prompt: result.rows[0].prompt });
                    rooms[roomId].gameState.roundPrompts[1] = result.rows[0].prompt;
                    console.log(`Game started in Room ${roomId} with Custom Deck #${rooms[roomId].gameState.deck}, starting Round 1 with ${rooms[roomId].users.length} users.`);
                } else {
                    console.error(`No prompts found for Custom Deck #${rooms[roomId].gameState.deck} in Room ${roomId}`);
                }
                startRound1(roomId);
                res.status(200).send('Game started with custom prompts');
            })
            .catch(error => {
                console.error('Error during custom deck creation or prompt retrieval:', error);
                res.status(500).send('Failed to start the game with custom deck');
            });
        } else {
            // If not using custom prompts, use the standard deck
            const deckId = rooms[roomId].gameState.deck;
            pool.query(`
                SELECT prompt
                FROM prompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId])
            .then(result => {
                if (result.rows.length > 0) {
                    io.to(roomId).emit('game-started', { round: 1, prompt: result.rows[0].prompt });
                    rooms[roomId].gameState.roundPrompts[1] = result.rows[0].prompt;
                    console.log(`Game started in Room ${roomId} with Deck #${deckId}, starting Round 1 with ${rooms[roomId].users.length} users.`);
                } else {
                    console.error(`No prompts found for Deck #${deckId} in Room ${roomId}`);
                }
                startRound1(roomId);
                res.status(200).send('Game started');
            })
            .catch(error => {
                console.error('Error fetching prompt from the standard deck:', error);
                res.status(500).send('Failed to start the game');
            });
        }
    } else {
        res.status(404).send('Room not found');
    }
});



// Start Round 1
function startRound1(roomId) {
    console.log(`Starting Round 1 for Room ${roomId}`);
    rooms[roomId].gameState.round = 1;
    rooms[roomId].gameState.submittedUsers = []; // Initialize or reset the submitted users list
}

function handleRoundSubmissions(roomId, username, gifUrl, round){
    if (!rooms[roomId].gameState.submissions[round]) {
        rooms[roomId].gameState.submissions[round] = {};
    }
    rooms[roomId].gameState.submissions[round][username] = gifUrl;

    // Track that this user has submitted
    if (!rooms[roomId].gameState.submittedUsers.includes(username)) {
        rooms[roomId].gameState.submittedUsers.push(username);
    }

    console.log(`User ${username} submitted a GIF for Round ${round} in Room ${roomId}. Total submitted: ${rooms[roomId].gameState.submittedUsers.length}/${rooms[roomId].users.length}`);

    // Check if all users have submitted for this round
    if (rooms[roomId].gameState.submittedUsers.length === rooms[roomId].users.length) {
        console.log(`All users submitted for Round ${round} in Room ${roomId}`);
        if(round == rooms[roomId].maxRound){
            setTimeout(() => {
                startVoting(roomId);
            }, 1000);
        }
        else{
            setTimeout(() => {
                startRound(roomId, round + 1);
            }, 1000);
        }
        
    }
}

async function startRound(roomId, round){
    console.log(`Starting Round ${round} for Room ${roomId}`);
    rooms[roomId].gameState.round = round;
    rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
    let deckId = rooms[roomId].gameState.deck;

    try {
        let result;
        console.log("is this room using custom decks?");
        console.log(rooms[roomId].gameState.useCustomDeck);
        if (rooms[roomId].gameState.useCustomDeck) {
            // Query from customPrompts table if using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM customPrompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        } else {
            // Query from standard prompts table if not using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM prompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        }
        
        if (result.rows.length > 0) {
            io.to(roomId).emit('next-round', { round: round, prompt: result.rows[0].prompt });
            rooms[roomId].gameState.roundPrompts[round] = result.rows[0].prompt;
            console.log(`Game started in Room ${roomId}, with Deck #${deckId}, starting Round ${round} with ${rooms[roomId].users.length} users.`);
        } else {
            console.error(`No prompts found for Deck ${deckId} in Room ${roomId}`);
        }
    } catch (error) {
        console.error('Error fetching prompt from the database:', error);
        res.status(500).send('Failed to start the game');
        return;
    }
    

}

// Handle Round 1 Submissions
function handleRound1Submission(roomId, username, gifUrl) {
    let round = 1;
    if (!rooms[roomId].gameState.submissions[round]) {
        rooms[roomId].gameState.submissions[round] = {};
    }
    rooms[roomId].gameState.submissions[round][username] = gifUrl;

    // Track that this user has submitted
    if (!rooms[roomId].gameState.submittedUsers.includes(username)) {
        rooms[roomId].gameState.submittedUsers.push(username);
    }

    console.log(`User ${username} submitted a GIF for Round 1 in Room ${roomId}. Total submitted: ${rooms[roomId].gameState.submittedUsers.length}/${rooms[roomId].users.length}`);

    // Check if all users have submitted for this round
    if (rooms[roomId].gameState.submittedUsers.length === rooms[roomId].users.length) {
        console.log(`All users submitted for Round 1 in Room ${roomId}`);
        setTimeout(() => {
            startRound2(roomId);
        }, 1000);
    }
}

// Start Round 2
async function startRound2(roomId) {
    console.log(`Starting Round 2 for Room ${roomId}`);
    rooms[roomId].gameState.round = 2;
    rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
    let deckId = rooms[roomId].gameState.deck;

    try {
        let result;
        console.log("is this room using custom decks?");
        console.log(rooms[roomId].gameState.useCustomDeck);
        if (rooms[roomId].gameState.useCustomDeck) {
            // Query from customPrompts table if using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM customPrompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        } else {
            // Query from standard prompts table if not using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM prompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        }
        
        if (result.rows.length > 0) {
            io.to(roomId).emit('next-round', { round: 2, prompt: result.rows[0].prompt });
            console.log(`Game started in Room ${roomId}, with Deck #${deckId}, starting Round 1 with ${rooms[roomId].users.length} users.`);
        } else {
            console.error(`No prompts found for Deck ${deckId} in Room ${roomId}`);
        }
    } catch (error) {
        console.error('Error fetching prompt from the database:', error);
        res.status(500).send('Failed to start the game');
        return;
    }
    
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
        setTimeout(() => {
            startRound3(roomId);
        }, 1000);
    }
}

// Start Round 3
async function startRound3(roomId) {
    console.log(`Starting Round 3 for Room ${roomId}`);
    rooms[roomId].gameState.round = 3;
    rooms[roomId].gameState.submittedUsers = []; // Reset submitted users for the new round
    let deckId = rooms[roomId].gameState.deck;
    try {
        let result;

        if (rooms[roomId].gameState.useCustomDeck) {
            // Query from customPrompts table if using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM customPrompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        } else {
            // Query from standard prompts table if not using custom deck
            result = await pool.query(`
                SELECT prompt
                FROM prompts
                WHERE deck_id = $1
                ORDER BY RANDOM()
                LIMIT 1
            `, [deckId]);
        }
        
        if (result.rows.length > 0) {
            io.to(roomId).emit('next-round', { round: 3, prompt: result.rows[0].prompt });
            console.log(`Game started in Room ${roomId}, with Deck #${deckId}, starting Round 1 with ${rooms[roomId].users.length} users.`);
        } else {
            console.error(`No prompts found for Deck ${deckId} in Room ${roomId}`);
        }
    } catch (error) {
        console.error('Error fetching prompt from the database:', error);
        res.status(500).send('Failed to start the game');
        return;
    }
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
        setTimeout(() => {
            startVoting(roomId);
        }, 1000);
    }
}

// Start Voting Phase
function startVoting(roomId) {
    console.log(`Starting Voting for Room ${roomId}`);
    io.to(roomId).emit('voting-start', { submissions: rooms[roomId].gameState.submissions, roundPrompts: rooms[roomId].gameState.roundPrompts});
}

app.post('/submit-gif', (req, res) => {
    let { roomId, username, gifUrl } = req.body;
    if (rooms[roomId]) {
        let round = rooms[roomId].gameState.round;
        handleRoundSubmissions(roomId, username, gifUrl, round);
        res.status(200).send('GIF submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

app.post('/submit-votes', (req, res) => {
    let { roomId, username, votes } = req.body;
    if (rooms[roomId]) {
        rooms[roomId].gameState.votes[username] = votes;
        io.to(roomId).emit('vote-submitted', { username });
        console.log(`User ${username} submitted votes in Room ${roomId}`);

        // Check if all users have voted
        console.log(rooms[roomId].gameState.votes);
        //let allVoted = rooms[roomId].users.every(user => rooms[roomId].gameState.votes[user.userId]);

        if (Object.keys(rooms[roomId].gameState.votes).length === rooms[roomId].users.length) {
            console.log(`All users voted in Room ${roomId}. Calculating scores...`);
            let scores = {};
            rooms[roomId].users.forEach(user => {
                //scores[user.userId] = 0;
                scores[user.username] = 0;
            });
            console.log('Initial scores:', scores); // Log initial scores

            Object.values(rooms[roomId].gameState.votes).forEach(userVotes => {
                console.log('User Votes:', userVotes); // Log individual user votes
                Object.entries(userVotes).forEach(([username, score]) => {
                    scores[username] += score;
                });
            });

            console.log('Final scores:', scores); // Log final calculated scores
            io.to(roomId).emit('game-over', { scores });
            console.log(`Game over in Room ${roomId}. Final scores sent.`);
        }

        res.status(200).send('Vote submitted');
    } else {
        res.status(404).send('Room not found');
    }
});

//send API request to GIPHY and return those gifs
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

//query the custom decks table to get 3 decks
app.get('/get-user-decks', async (req, res) => {
    const limit = 3;
    const offset = parseInt(req.query.offset) || 0; // Default to 0 if no offset is provided

    try {
        // Fetch custom decks with a limit and offset
        const deckResults = await pool.query(`
            SELECT id, name, creator 
            FROM customDecks
            ORDER BY id
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const decks = [];

        for (const deck of deckResults.rows) {
            // Fetch prompts associated with each deck
            const promptResults = await pool.query(`
                SELECT prompt 
                FROM customPrompts 
                WHERE deck_id = $1
            `, [deck.id]);

            decks.push({
                id: deck.id,  
                deckName: deck.name,
                creator: deck.creator,
                prompts: promptResults.rows.map(row => row.prompt)
            });
        }

        res.json(decks);
    } catch (error) {
        console.error('Error fetching decks:', error);
        res.status(500).send('Failed to retrieve decks');
    }
});

//function to delete the deck
app.post('/delete-deck', async (req, res) => {
    const { deckId } = req.body;
    try {
        await pool.query('DELETE FROM customDecks WHERE id = $1', [deckId]);
        await pool.query('DELETE FROM customPrompts WHERE deck_Id = $1', [deckId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});



io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        userSocketMap[socket.id] = { roomId, username };
    });

    socket.on('chat-message', (data) => {
        io.to(data.roomId).emit('chat-message', { username: data.username, message: data.message });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        let { roomId, username } = userSocketMap[socket.id];
        if (roomId && rooms[roomId]) {
            let room = rooms[roomId];
            room.users = room.users.filter(user => user.username !== username);
            io.to(roomId).emit('user-left', { username });
            console.log(`User ${username} left Room ${roomId}`);

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