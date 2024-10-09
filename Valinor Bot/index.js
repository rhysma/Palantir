const cron = require('node-cron');
const { MongoClient } = require('mongodb');
const getContributors = require('./getContributors.js')

require("dotenv").config();

// MongoDB Atlas connection
const uri = process.env['mongoURL'];
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

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
async function fetchAndStoreContributors() {
  

  //const subreddit = await r.getSubreddit(subredditName);
  let after = null;
  let attempts = 0;
  const maxAttempts = 5; // Define a maximum number of retry attempts
  const collection = await connectToMongo();
  let count = 0
  const names = []
  do {
    try {
      let result = await getContributors(after);
      //console.log(result)
      after = result.after
      result = result.children
      //console.log(result)
      count+=result.length;
      
      if (result.length === 0) {
        console.log("no results")
        break;
      }
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
      await delay(750); // Add delay between requests to respect rate limits
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
    console.log(`Contributors so far: ${count}`)
  } while (after);
  end:
  await client.close();
}


async function fetchMembersAndStore() {
  try {
    await fetchAndStoreContributors(); // Replace with your subreddit name
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


