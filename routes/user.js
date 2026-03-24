const express = require('express');
const router = express.Router();
const { getUsers, searchGlobal, getContacts } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/search', protect, searchGlobal);
router.get('/contacts', protect, getContacts);
router.get('/', protect, getUsers);

module.exports = router;
