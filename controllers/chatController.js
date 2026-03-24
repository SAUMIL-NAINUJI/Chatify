const Message = require('../models/Message');
const Group = require('../models/Group');
const { decrypt, encrypt } = require('../utils/encryption');

// @desc    Get chat history between two users
// @route   GET /chat/:userId
const getPrivateMessages = async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { senderId: req.user._id, receiverId: req.params.userId },
                { senderId: req.params.userId, receiverId: req.user._id }
            ],
            groupId: null
        }).sort({ createdAt: 1 });

        const decryptedMessages = messages.map(msg => {
            return {
                ...msg.toObject(),
                message: decrypt(msg.message)
            };
        });

        res.status(200).json({ success: true, data: decryptedMessages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create a new group
// @route   POST /chat/group
const createGroup = async (req, res) => {
    try {
        const { groupName, members } = req.body;
        
        let allMembers = members ? JSON.parse(members) : [];
        allMembers.push(req.user._id); // Add creator

        const group = await Group.create({
            groupName,
            adminId: req.user._id,
            members: allMembers
        });

        res.status(201).json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all groups user is part of
// @route   GET /chat/groups
const getUserGroups = async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user._id });
        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get group chat history
// @route   GET /chat/group/:groupId
const getGroupMessages = async (req, res) => {
    try {
        const messages = await Message.find({
            groupId: req.params.groupId,
            $or: [
                { messageMode: 'broadcast' },
                { messageMode: 'unicast', senderId: req.user._id },
                { messageMode: 'unicast', targetUserId: req.user._id }
            ]
        }).populate('senderId', 'username profilePicture').sort({ createdAt: 1 });

        const decryptedMessages = messages.map(msg => {
            return {
                ...msg.toObject(),
                message: decrypt(msg.message)
            };
        });

        res.status(200).json({ success: true, data: decryptedMessages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete a group (Admin only)
// @route   DELETE /chat/group/:groupId
const deleteGroup = async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
        if (group.isGeneral) return res.status(403).json({ success: false, message: 'Cannot modify General group' });
        
        if (req.user.id !== group.adminId?.toString()) {
            return res.status(403).json({ success: false, message: 'Only admin can delete group' });
        }

        await Group.findByIdAndDelete(req.params.groupId);
        await Message.deleteMany({ groupId: req.params.groupId });

        res.status(200).json({ success: true, message: 'Group deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Add user to a group (Admin only)
// @route   POST /chat/group/add-user
const addUserToGroup = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
        if (group.isGeneral) return res.status(403).json({ success: false, message: 'Cannot modify General group' });
        
        if (req.user.id !== group.adminId?.toString()) {
            return res.status(403).json({ success: false, message: 'Only admin can add members' });
        }

        const user = await require('../models/User').findById(userId); // Require here to fetch single user or directly check
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (group.members.includes(userId)) {
            return res.status(400).json({ success: false, message: 'User already in group' });
        }

        group.members.push(userId);
        await group.save();

        res.status(200).json({ success: true, message: 'User added successfully', data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Remove user from a group (Admin only)
// @route   POST /chat/group/remove-user
const removeUserFromGroup = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
        if (group.isGeneral) return res.status(403).json({ success: false, message: 'Cannot modify General group' });
        
        if (req.user.id !== group.adminId?.toString()) {
            return res.status(403).json({ success: false, message: 'Only admin can remove members' });
        }

        if (group.adminId.toString() === userId) {
            return res.status(400).json({ success: false, message: 'Cannot remove the admin' });
        }

        group.members = group.members.filter(memberId => memberId.toString() !== userId.toString());
        await group.save();

        res.status(200).json({ success: true, message: 'User removed successfully', data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = { getPrivateMessages, createGroup, getUserGroups, getGroupMessages, deleteGroup, addUserToGroup, removeUserFromGroup };
