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

// Function to connect to MongoDB
async function connectToMongo() {
  if (!client.isConnected) { 
    await client.connect();
  }
  const db = client.db('discord');
  return db.collection('luxelife_users');
}

// Function to delay execution to respect rate limits
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to fetch all contributors with pagination and update MongoDB incrementally
async function fetchAndStoreContributors(subredditName) {
  const subreddit = await r.getSubreddit(subredditName);
  let after = null;
  let attempts = 0;
  const maxAttempts = 5; // Define a maximum number of retry attempts
  const collection = await connectToMongo();

  do {
    try {
      const result = await subreddit.getContributors({ limit: 100, after });
      if (result.length === 0) {
        break;
      }
      after = result[result.length - 1].name;
      console.log(`Fetched ${result.length} contributors in this batch...`);

      // Print usernames in a comma-separated list
      const usernames = result.map(contributor => contributor.name).join(', ');
      console.log(`Usernames: ${usernames}`);

      // Update MongoDB incrementally
      for (const contributor of result) {
        const userData = {
          username: contributor.name,
          date_joined: new Date(), // Adjust based on available data
        };
        await collection.updateOne({ username: contributor.name }, { $set: userData }, { upsert: true });
      }

      console.log(`Updated ${result.length} contributors in MongoDB.`);
      await delay(2000); // Add delay between requests to respect rate limits
      attempts = 0; // Reset attempts counter after a successful request
    } catch (error) {
      console.error('Error fetching contributors:', error.message);
      if (++attempts >= maxAttempts) {
        console.error('Maximum retry attempts reached. Exiting...');
        break;
      }
      console.log(`Retrying... (${attempts}/${maxAttempts})`);
      await delay(5000); // Wait longer before retrying
    }
  } while (after);

  await client.close();
}


async function fetchMembersAndStore() {
  try {
    await fetchAndStoreContributors(subredditName); // Replace with your subreddit name
    console.log('Member list updated in MongoDB.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}


// Schedule the task to run daily at midnight
cron.schedule('0 0 * * *', () => {
  fetchMembersAndStore();
});

// Run the task immediately (optional)
fetchMembersAndStore();


