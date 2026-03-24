const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Get all users except the logged-in user
// @route   GET /user
const getUsers = async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Global search users and groups by query
// @route   GET /user/search?query=val
const searchGlobal = async (req, res) => {
    try {
        const query = req.query.query || '';
        if (!query) return res.status(200).json({ success: true, data: { users: [], groups: [] } });

        const regex = new RegExp(query, 'i');
        
        const [users, groups] = await Promise.all([
            User.find({ username: { $regex: regex }, _id: { $ne: req.user._id } }).select('username status profilePicture'),
            require('../models/Group').find({ groupName: { $regex: regex } })
        ]);

        res.status(200).json({ success: true, data: { users, groups } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get list of users the current user has chatted with
// @route   GET /user/contacts
const getContacts = async (req, res) => {
    try {
        const userId = req.user._id;

        const privateMessages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }],
            groupId: null
        }).select('senderId receiverId');

        const unicastMessages = await Message.find({
            messageMode: 'unicast',
            $or: [{ senderId: userId }, { targetUserId: userId }]
        }).select('senderId targetUserId');

        const contactIds = new Set();
        privateMessages.forEach(msg => {
            if (msg.senderId && msg.senderId.toString() !== userId.toString()) contactIds.add(msg.senderId.toString());
            if (msg.receiverId && msg.receiverId.toString() !== userId.toString()) contactIds.add(msg.receiverId.toString());
        });

        unicastMessages.forEach(msg => {
            if (msg.senderId && msg.senderId.toString() !== userId.toString()) contactIds.add(msg.senderId.toString());
            if (msg.targetUserId && msg.targetUserId.toString() !== userId.toString()) contactIds.add(msg.targetUserId.toString());
        });

        const contacts = await User.find({ _id: { $in: Array.from(contactIds) } }).select('-password');
        
        res.status(200).json({ success: true, data: contacts });
    } catch (error) {
        console.error('getContacts error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = { getUsers, searchGlobal, getContacts };
