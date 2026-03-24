const express = require('express');
const router = express.Router();
const { getPrivateMessages, createGroup, getUserGroups, getGroupMessages, deleteGroup, addUserToGroup, removeUserFromGroup } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.post('/group/add-user', protect, addUserToGroup);
router.post('/group/remove-user', protect, removeUserFromGroup);
router.delete('/group/:groupId', protect, deleteGroup);

// Order matters: place generic routes after more specific ones
router.get('/:userId', protect, getPrivateMessages);
router.post('/group', protect, createGroup);
router.get('/groups/all', protect, getUserGroups);
router.get('/group/:groupId', protect, getGroupMessages);

module.exports = router;
