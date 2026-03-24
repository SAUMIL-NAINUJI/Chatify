const Message = require('../models/Message');
const User = require('../models/User');
const { encrypt } = require('../utils/encryption');

module.exports = function (io) {
    const onlineUsers = new Map();

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        // User connects and registers their personal room
        socket.on('setup', async (userId) => {
            socket.join(userId);
            onlineUsers.set(userId, socket.id);
            socket.userId = userId;

            // Broadcast to all that user is online
            await User.findByIdAndUpdate(userId, { status: 'online' });
            io.emit('user_status_change', { userId, status: 'online' });
            console.log(`User ${userId} joined their personal room`);
        });

        // Join a group room
        socket.on('join_group', (groupId) => {
            socket.join(groupId);
            console.log(`User ${socket.userId} joined group ${groupId}`);
        });

        // Listen for new message
        socket.on('send_message', async (data) => {
            const { senderId, receiverId, groupId, message, messageType, messageMode, targetUserId } = data;

            try {
                // Encrypt message text
                const encryptedMessage = encrypt(message);

                // Save to DB
                const newMessage = await Message.create({
                    senderId,
                    receiverId: receiverId || null,
                    groupId: groupId || null,
                    message: encryptedMessage,
                    messageType: messageType || 'text',
                    messageMode: messageMode || 'broadcast',
                    targetUserId: targetUserId || null
                });

                // Populate sender details before emitting
                const populatedMessage = await Message.findById(newMessage._id).populate('senderId', 'username profilePicture');

                // Attach decrypted message for emitting
                const emitData = {
                    ...populatedMessage.toObject(),
                    message: message // Emit the plain text down the wire
                };

                if (groupId) {
                    if (messageMode === 'unicast' && targetUserId) {
                        // Unicast: emit to target and back to sender
                        const targetSocketId = onlineUsers.get(targetUserId);
                        if (targetSocketId) {
                            io.to(targetSocketId).emit('receive_message', emitData);
                        }
                        socket.emit('receive_message', emitData);
                    } else {
                        // Broadcast to group
                        io.to(groupId).emit('receive_message', emitData);
                    }
                } else if (receiverId) {
                    io.to(receiverId).emit('receive_message', emitData);
                    // Also emit to sender so their UI updates
                    socket.emit('receive_message', emitData);
                }
            } catch (err) {
                console.error('Error saving message:', err);
            }
        });

        // Typing indicator
        socket.on('typing', ({ room, typerId }) => {
            socket.to(room).emit('typing', { room, typerId });
        });

        socket.on('stop_typing', ({ room, typerId }) => {
            socket.to(room).emit('stop_typing', { room, typerId });
        });

        // Advanced Group Features Listeners
        socket.on('group_deleted', (groupId) => {
            io.to(groupId).emit('group_deleted', groupId);
        });

        socket.on('user_added', ({ groupId, memberId }) => {
            io.to(groupId).emit('user_added', { groupId, memberId });
        });

        socket.on('user_removed', ({ groupId, memberId }) => {
            io.to(groupId).emit('user_removed', { groupId, memberId });
            // If the removed user is online, they need to leave the room.
            // Find their socket using onlineUsers map and make them leave
            const removedSocketId = onlineUsers.get(memberId);
            if (removedSocketId) {
                const removedSocket = io.sockets.sockets.get(removedSocketId);
                if (removedSocket) {
                    removedSocket.leave(groupId);
                }
            }
        });

        socket.on('disconnect', async () => {
            console.log('User disconnected:', socket.id);
            if (socket.userId) {
                onlineUsers.delete(socket.userId);
                await User.findByIdAndUpdate(socket.userId, { 
                    status: 'offline', 
                    lastSeen: Date.now() 
                });
                io.emit('user_status_change', { userId: socket.userId, status: 'offline', lastSeen: Date.now() });
            }
        });
    });
};
