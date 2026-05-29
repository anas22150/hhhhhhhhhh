const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// تخزين اللاعبين: socket.id -> { name, points }
const players = new Map();

// خدمة الملفات الثابتة من الجذر
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('🟢 لاعب جديد:', socket.id);
    let currentName = null;

    socket.on('join', (name) => {
        // التحقق من وجود الاسم مسبقاً
        let existing = false;
        for (let [id, p] of players.entries()) {
            if (p.name === name && id !== socket.id) {
                existing = true;
                break;
            }
        }
        if (existing) {
            socket.emit('joinError', 'الاسم موجود بالفعل، اختر اسماً آخر');
            return;
        }
        currentName = name;
        players.set(socket.id, { name, points: 0 });
        // إرسال قائمة اللاعبين الحالية للجميع
        broadcastPlayers();
        socket.emit('joined', { name, points: 0 });
    });

    socket.on('clickPlanet', () => {
        const player = players.get(socket.id);
        if (player) {
            player.points += 1;
            broadcastPlayers();
        }
    });

    socket.on('sendPoints', ({ targetName, amount }) => {
        const sender = players.get(socket.id);
        if (!sender) return;
        if (sender.points < amount) {
            socket.emit('error', 'ليس لديك نقاط كافية');
            return;
        }
        if (amount <= 0) {
            socket.emit('error', 'يجب أن تكون النقاط أكبر من 0');
            return;
        }
        let receiverSocketId = null;
        for (let [id, p] of players.entries()) {
            if (p.name === targetName && id !== socket.id) {
                receiverSocketId = id;
                break;
            }
        }
        if (!receiverSocketId) {
            socket.emit('error', 'اللاعب غير موجود');
            return;
        }
        const receiver = players.get(receiverSocketId);
        sender.points -= amount;
        receiver.points += amount;
        broadcastPlayers();
        io.to(receiverSocketId).emit('receivedPoints', { from: sender.name, amount });
        socket.emit('pointsSent', { to: receiver.name, amount });
    });

    socket.on('disconnect', () => {
        if (players.has(socket.id)) {
            players.delete(socket.id);
            broadcastPlayers();
            console.log('🔴 لاعب غادر:', socket.id);
        }
    });

    function broadcastPlayers() {
        const playersList = Array.from(players.values());
        io.emit('updatePlayers', playersList);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ خادم Planet Clicker يعمل على http://localhost:${PORT}`));