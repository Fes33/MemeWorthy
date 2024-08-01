const express = require('express');
const { v4: uuidv4 } = require('uuid'); //used to generate user IDs
const app = express();
const port = 3000;


app.use(express.static('public'));
app.use(express.json());

let rooms = {}; //stores active rooms and its details

//Post requests creates a room and adds the creator
app.post('/create-room', (req, res) => {
    let roomId = Math.floor(100000 + Math.random() * 900000).toString(); //generate 6-digit room ID
    let userId = uuidv4(); //generate a userId for this person
    let { username } = req.body; //grab username from request body

    //add the room and the creator to the rooms object
    rooms[roomId] = {
        ownerId: userId,
        users: [{ userId, username }]
    };
    res.status(200).json({ roomId, userId });
});

//Post requests to add user that joined the room
app.post('/join-room', (req, res) => {
    let { roomId, username } = req.body; //get roomID and user's username from request body
    if (rooms[roomId]) { //if this room exists and is in the object of active rooms
        let userId = uuidv4(); //generate a userId for this person
        rooms[roomId].users.push({ userId, username }); //push the user ID and username of the user into the list of users of that room
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

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});