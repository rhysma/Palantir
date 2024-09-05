const path = require('path');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv

const { EmbedBuilder } = require('discord.js');
const request = require('request-promise');
const serverSchema = require('../../models/serverSchema.js');
const userSchema = require('../../models/userSchema.js');
const reddit_get = require('./reddit-get.js')

require('dotenv').config();
let buffer = fs.readFileSync(".env.token");
let config = dotenv.parse(buffer)

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

module.exports = async (interaction, client) => {
    await interaction.deferReply({ ephemeral: true });
    let username = interaction.options.getString('username').toLowerCase().replace('u/','');
    let userData = await userSchema.findOne({userId: interaction.user.id});
    let serverData = await serverSchema.findOne({guildId: interaction.guild?.id});

    let accessToken = config.ACCESS_TOKEN;
    if (username == userData?.redditUsername) {
        return interaction.editReply({content: "You've already set your Reddit username!", ephemeral: true});
    }

    let existingUser = await userSchema.findOne({ redditUsername: username });
    if (existingUser) {
        return interaction.editReply({content: "Someone already has this username! Contact a mod if this is an issue.", ephemeral: true});
    }
    
    try {
        await request({
            url: `https://oauth.reddit.com/user/${username}/about.json`,
            headers: {
                'User-Agent': 'PALANTIR-DISCORD-BOT',
                'Authorization': `Bearer ${accessToken}`,
            }
        });
    } catch(err) {
        if (err.statusCode === 403 || err.statusCode === 401) {
            // Access token expired, refresh it
            accessToken = await refreshAccessToken();

            // Retry the original request with the new token
            try {
                await request({
                    url: `https://oauth.reddit.com/user/${username}/about.json`,
                    headers: {
                        'User-Agent': 'PALANTIR-DISCORD-BOT',
                        'Authorization': `Bearer ${accessToken}`,
                    }
                });
            } catch(err2) {
                return interaction.editReply({content: "This Reddit profile doesn't exist!", ephemeral: true});
            }
        } else {
            return interaction.editReply({content: "This Reddit profile doesn't exist!", ephemeral: true});
        }
    
    }
    let logMessage;
    if (userData?.redditUsername) {
        interaction.editReply({content: `Changed your Reddit username from **u/${userData.redditUsername}** to **u/${username}**`, ephemeral: true});
        logMessage = `\`u/${userData.redditUsername}\` → \`u/${username}\``;
        userData.redditUsername = username;
    }
    else {
        interaction.editReply({content: `Got it! Your Reddit username is **u/${username}**`, ephemeral: true});
        logMessage = `\`u/${username}\``;
        
        userData = await userSchema.create({
            userId: interaction.user.id,
            redditUsername: username
        });
        console.log(`Created new user schema: ${interaction.user.tag}`);
    
        if (serverData?.redditRole) {
            interaction.member?.roles.add(serverData.redditRole);
        }
    }

    userData.save();

    if (!serverData?.logChannelId) return;
    const guild = await client.guilds.cache.get(interaction.guild.id);
    const channel = await guild.channels.fetch(serverData.logChannelId);
    
    channel.send({
        embeds: [
            new EmbedBuilder()
                .setAuthor({
                    name: `${interaction.user.tag} set their Reddit username`, 
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTitle(logMessage)
                .setColor('#ff5700')
        ]
    });
}