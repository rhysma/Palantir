const snoowrap = require('snoowrap');
const cron = require('node-cron');
const { MongoClient } = require('mongodb');

require("dotenv").config();
const token = process.env['valinor_token'];
const clientId = process.env['valinor_clientID'];
const username = process.env['reddit_username'];
const password = process.env['reddit_password'];

// Reddit API credentials
const r = new snoowrap({
  userAgent: 'Valinor/1.0 by HighFlyingSquirrel',
  clientId: clientId,
  clientSecret: token,
  username: username,
  password: password
});


// MongoDB Atlas connection
const uri = process.env['mongoURL'];
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const subredditName = 'LuxeLife';

async function fetchMembersAndStore() {
  try {
    await client.connect();
    const database = client.db('discord');
    const collection = database.collection('luxelife_users');

    const subreddit = await r.getSubreddit(subredditName);
    const contributors = await subreddit.getContributors();

    for (const contributor of contributors) {
      const userData = {
        username: contributor.name,
        date_joined: new Date(), // Adjust based on available data
      };
      await collection.updateOne({ username: contributor.name }, { $set: userData }, { upsert: true });
    }

    console.log('Member list updated in MongoDB.');
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

// Schedule the task to run daily at midnight
cron.schedule('0 0 * * *', () => {
  fetchMembersAndStore();
});

// Run the task immediately (optional)
fetchMembersAndStore();


