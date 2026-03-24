const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    groupName: {
        type: String,
        required: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    groupIcon: {
        type: String,
        default: ''
    },
    isGeneral: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
