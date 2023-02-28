const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema(
    {
        guildId: {type: String, require: true, unique: true},
        logChannelId: {type: String, unique: true},
        redditRole: {type: String}
    },
    {
        collection: 'servers'
    }
);

module.exports = mongoose.model('ServerModels', serverSchema,);