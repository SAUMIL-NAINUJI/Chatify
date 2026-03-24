require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
      console.log('MongoDB Connected');
      const Group = require('./models/Group');
      const User = require('./models/User');
      let generalGroup = await Group.findOne({ isGeneral: true });
      if (!generalGroup) {
          generalGroup = await Group.create({
              groupName: "General",
              isGeneral: true,
              members: []
          });
          console.log('General group created');
      }

      // Automatically sync all users to the general group
      const allUsers = await User.find({}, '_id');
      const userIds = allUsers.map(u => u._id);
      await Group.findByIdAndUpdate(generalGroup._id, {
          $addToSet: { members: { $each: userIds } }
      });
  })
  .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/chat', require('./routes/chat'));
app.use('/user', require('./routes/user'));

// Socket Setup
require('./sockets/chatSocket')(io);

const { protect } = require('./middleware/authMiddleware');

// Frontend View Routes
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/chat', protect, (req, res) => {
    res.render('chat', { user: req.user });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
