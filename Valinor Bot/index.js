const cron = require('node-cron');
const { MongoClient } = require('mongodb');
const getContributors = require('./getContributors.js');

require('dotenv').config();

// --- Crash protection -------------------------------------------------
// If either of these fires uncaught, the whole process dies and (unless
// something like pm2/systemd restarts it) nothing runs again until someone
// notices. Log it instead of dying, so the next cron tick still fires.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

// MongoDB Atlas connection
const uri = process.env['mongoURL'];
if (!uri) {
    console.error('mongoURL environment variable is not set. Exiting.');
    process.exit(1);
}
const client = new MongoClient(uri);
let mongoConnected = false;

async function connectToMongo() {
    if (!mongoConnected) {
        await client.connect();
        mongoConnected = true;
    }
    const db = client.db('discord');
    return db.collection('luxelife_users');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Prevent overlapping runs if one sync is still going when the next cron tick fires.
let syncInProgress = false;

// Fetch all contributors with pagination, upsert current members, and
// remove members who are no longer contributors (left / removed / demoted).
async function fetchAndStoreContributors() {
    let after = null;
    let attempts = 0;
    const maxAttempts = 5;
    const collection = await connectToMongo();
    let count = 0;
    const runStartedAt = new Date();
    const seenUsernames = new Set();

    do {
        try {
            let result = await getContributors(after);
            after = result.after;
            const children = result.children;
            count += children.length;

            if (children.length === 0) {
                console.log('No more results.');
                break;
            }

            console.log(`Fetched ${children.length} contributors in this batch...`);
            const usernames = children.map(c => c.name).join(', ');
            console.log(`Usernames: ${usernames}`);

            for (const contributor of children) {
                seenUsernames.add(contributor.name);
                await collection.updateOne(
                    { username: contributor.name },
                    {
                        $set: { username: contributor.name, last_synced: runStartedAt },
                        $setOnInsert: { date_joined: new Date() },
                    },
                    { upsert: true }
                );
            }

            console.log(`Updated ${children.length} contributors in MongoDB.`);
            await delay(2000); // respect rate limits
            attempts = 0;
        } catch (error) {
            console.error('Error fetching contributors:', error.message);
            if (++attempts >= maxAttempts) {
                console.error('Maximum retry attempts reached. Aborting this sync run (will retry on next scheduled run).');
                // Bail out without removing anyone - we don't have a complete
                // picture of current members, so deleting could wipe valid users.
                return;
            }
            console.log(`Retrying... (${attempts}/${maxAttempts})`);
            await delay(5000);
        }
        console.log(`Contributors so far: ${count}`);
    } while (after);

    // Remove members who are no longer contributors. Only runs if we made it
    // through the full paginated list above without giving up early.
    const deleteResult = await collection.deleteMany({
        last_synced: { $lt: runStartedAt },
    });
    if (deleteResult.deletedCount > 0) {
        console.log(`Removed ${deleteResult.deletedCount} member(s) no longer contributors.`);
    }

    console.log(`Sync complete. ${seenUsernames.size} current contributors.`);
}

async function fetchMembersAndStore() {
    if (syncInProgress) {
        console.log('Sync already in progress, skipping this trigger.');
        return;
    }
    syncInProgress = true;
    try {
        await fetchAndStoreContributors();
        console.log('Member list updated in MongoDB.');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        syncInProgress = false;
    }
}

// Schedule the task to run daily at midnight
cron.schedule('0 0 * * *', () => {
    fetchMembersAndStore();
});

// Run the task immediately on startup
fetchMembersAndStore();

console.log('Bot started. Scheduled to run daily at midnight; running an initial sync now.');