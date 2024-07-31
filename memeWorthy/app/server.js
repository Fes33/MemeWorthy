const express = require('express');

const app = express();
const port = 3000;


app.use(express.static('public'));

// Request handler for route to create a new room
app.get('/create-room', (req, res) => {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString(); //generate a random 6-digit room ID
    res.redirect(`/room/${roomId}`);
});

// Request handler for route to join an existing room
app.get('/room/:roomId', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

