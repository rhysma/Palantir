const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        userId: {type: String, require: true, unique: true},
        redditUsername: {type: String, unique: true}
    },
    {
        collection: 'users'
    }
);

module.exports = mongoose.model('UserModels', userSchema,);