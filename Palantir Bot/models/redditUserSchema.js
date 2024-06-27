const mongoose = require('mongoose');

const redditUserSchema = new mongoose.Schema(
    {
        username: {type: String, require: true, unique: true},
        date_joined: {type: Date, unique: false}
    },
    {
        collection: 'luxelife_users'
    }
);

module.exports = mongoose.model('RedditUserModels', redditUserSchema,);