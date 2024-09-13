const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');  // Import dotenv

require('dotenv').config();

const uri = process.env.mongoURL;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToMongo() {
    if (!client.isConnected) { 
      await client.connect();
    }
    const db = client.db('discord');
    return db.collection('luxelife_users');
}

module.exports = async (redditUsername) => {
    console.log(`Checking if username ${redditUsername} is in the database...`);
    const collection = await connectToMongo();
    let redditUserData = await collection.findOne({ username: new RegExp(`^${redditUsername}$`, 'i') });
    console.log("Database query result:", redditUserData);

    return (redditUserData ? true : false)
}