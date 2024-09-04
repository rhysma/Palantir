const path = require('path');
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const request = require('request-promise');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv
const userSchema = require('../../models/userSchema.js');
//const redditUserSchema = require('../../models/redditUserSchema.js');
const { MongoClient } = require('mongodb');

// MongoDB Atlas connection
const uri = process.env.mongoURL;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env.token') });

let redditStatus = "";
let accessToken = process.env.access_token;

// Function to connect to MongoDB
async function connectToMongo() {
    if (!client.isConnected) { 
      await client.connect();
    }
    const db = client.db('discord');
    return db.collection('luxelife_users');

  }

console.log('Initial Access Token:', accessToken);

function formatTimeDifference(date1, date2) {
    let years = date2.getYear() - date1.getYear();
    let months = date2.getMonth() - date1.getMonth();
let days = date2.getDate() - date1.getDate();
  
    if (days < 0) 
    {
        days += 31;
        months--;
    }

    if (months < 0) 
    {
        months += 12;
        years--;
    }

    let result = [];
    if (years) result.push(`${years} year${(years > 1) ? 's' : ''}`);
    if (months) result.push(`${months} month${(months > 1) ? 's' : ''}`);
    if (days) result.push(`${days} day${(days > 1) ? 's' : ''}`);

    if (result.length == 3) return `${result[0]}, ${result[1]} and ${result[2]}`;
    if (result.length == 2) return `${result[0]} and ${result[1]}`;
    return result[0];
}

async function refreshAccessToken() {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const data = 'grant_type=client_credentials';

    try {
        const response = await axios.post('https://www.reddit.com/api/v1/access_token', data, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        accessToken = response.data.access_token;
        console.log('New Access Token:', accessToken);

        // Update .env file
        fs.writeFileSync('.env.token', `ACCESS_TOKEN=${accessToken}\n`, { flag: 'w' });
        console.log('Token updated successfully!');
        return accessToken;
    } catch (error) {
        console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
}

async function getRedditUserData(redditUsername) {
    try {
        const body = await request({
            url: `https://oauth.reddit.com/user/${redditUsername}/about.json`,
            headers: {
                'User-Agent': 'PALANTIR-DISCORD-BOT',
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        return JSON.parse(body).data;
    } catch (err) {
        if (err.statusCode === 403) {
            // Access token expired, refresh it
            accessToken = await refreshAccessToken();
            console.log('New Access Token:', accessToken);

            // Retry the original request with the new token
            const body = await request({
                url: `https://oauth.reddit.com/user/${redditUsername}/about.json`,
                headers: {
                    'User-Agent': 'PALANTIR-DISCORD-BOT',
                    'Authorization': `Bearer ${accessToken}`,
                },
            });
            return JSON.parse(body).data;
        } else {
            const errorMessage = err.response?.data || err.message;
            console.error(`Error checking Reddit profile: ${errorMessage}`);
            throw new Error(`Failed to fetch Reddit profile for ${redditUsername}`);
        }
    }
}

module.exports = async (interaction) => {
    await interaction.deferReply({ ephemeral: true });

    let user = interaction.options.getUser('user');

    let userData = await userSchema.findOne({ userId: user.id });
   
    if (!userData?.redditUsername) {
        console.log(`${user} has not linked their Reddit username!`);
        return await interaction.editReply({ content: `${user} has not linked their Reddit username!`, ephemeral: true });
    }

    try {
        const redditUsername = userData.redditUsername;
        console.log("Reddit Username:", redditUsername);

        const redditData = await getRedditUserData(userData.redditUsername);
        console.log(`Checking if username ${redditUsername} is in the database...`);

        const collection = await connectToMongo();

        let redditUserData = await collection.findOne({ username: new RegExp(`^${redditUsername}$`, 'i') });

        console.log("Database query result:", redditUserData);


        if (!redditUserData) 
        {
            redditStatus = "\u274c  User is NOT a member of the LuxeLife subreddit";
            console.log("User is NOT a member of the LuxeLife subreddit");

        } 
        else 
        {
            redditStatus = "\u2705  User is a member of the LuxeLife subreddit";
            console.log("User is a member of the LuxeLife subreddit");

        }

        let dateCreated = new Date(redditData.created_utc * 1000);
        const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
        let formattedDate = `${months[dateCreated.getMonth()]} ${dateCreated.getDate()}, ${dateCreated.getFullYear()}`;

        interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setAuthor({
                        name: `${user.tag}'s Reddit profile`,
                        iconURL: user.displayAvatarURL(),
                    })
                    .setTitle(redditData.subreddit.display_name_prefixed)
                    .setURL(`https://reddit.com${redditData.subreddit.url}`)
                    .addFields([
                        {
                            name: redditData.subreddit.title.length ? redditData.subreddit.title : redditData.name,
                            value: `${redditStatus}\n${redditData.subreddit.public_description.length ? `*"${redditData.subreddit.public_description}"*\n` : ''}\u2b50 **${redditData.total_karma}** karma`,
                            inline: true,
                        },
                    ])
                    .setThumbnail(redditData.subreddit.icon_img.split('?')[0])
                    .setColor('#ff5700')
                    .setFooter({ text: `Account created ${formattedDate} \n${formatTimeDifference(dateCreated, new Date())} ago` }),
            ],
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error:', error.message);
        return interaction.editReply({ content: `Failed to fetch Reddit profile for ${userData.redditUsername}.`, ephemeral: true });
    }
};