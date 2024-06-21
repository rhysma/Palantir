const snoowrap = require('snoowrap');
const cron = require('node-cron');

require("dotenv").config();
const mongoose = require('mongoose');
const token = process.env['token'];
const clientId = process.env['clientId'];
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
const client = new MongoClient(process.env['mongoURL'], { useNewUrlParser: true, useUnifiedTopology: true });

const subredditName = 'Luxelife';

async function fetchMembersAndStore() {
  try {
    await client.connect();
    const database = client.db('palantir');
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


