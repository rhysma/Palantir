const path = require('path');
const axios = require('axios');
const { EmbedBuilder, embedLength } = require('discord.js');
const request = require('request-promise');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv
const userSchema = require('../../models/userSchema.js');
//const redditUserSchema = require('../../models/redditUserSchema.js');
const { MongoClient } = require('mongodb');
const redditUserCheck = require('../../functions/reddit-user-check.js');
const embedBuilder = require('../../functions/embedBuilder.js');
const checkRedditMembership = require('../../functions/checkRedditMembership.js');

// MongoDB Atlas connection
const uri = process.env.mongoURL;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

require('dotenv').config();

module.exports = async (interaction) => {
    await interaction.deferReply({ ephemeral: true });

    // Only allow run by administrator
    if (!interaction.memberPermissions?.has('Administrator')) {
        return await interaction.editReply({
            content: '❌ You do not have permission to use this command.',
            ephemeral: true,
        });
    }

    // Setup variables 
    let user = interaction.options.getUser('user');
    let userData = await userSchema.findOne({ userId: user.id });

    // Check if user has linked Reddit
    if (!userData?.redditUsername) {
        console.log(`${user} has not linked their Reddit username!`);
        return await interaction.editReply({ content: `${user} has not linked their Reddit username!`, ephemeral: true });
    }

    try {
        console.log("Reddit Username:", userData.redditUsername);

        // Grab user data from Reddit API
        let redditData;
        try {
            redditData = await redditUserCheck(userData.redditUsername, interaction);
        } catch (err) {
            return await interaction.editReply({ content: `Error retrieving Reddit profile.`, ephemeral: true });
        }

        // Check user's membership in subreddit
        let redditMembership = await checkRedditMembership(userData.redditUsername);
        const passedRequirements = redditData.total_karma >= 100 && redditMembership;

        // Build embed
        let embed = await embedBuilder(user, redditData, redditMembership);

        // Always display the embed as an ephemeral reply
        await interaction.editReply({
            embeds: [embed],
            ephemeral: true,
        });

        // Send public message about access status
        if (passedRequirements) {
            // Assign "access" role
            const guild = interaction.guild;
            const member = await guild.members.fetch(user.id);
            const accessRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'access');

            if (!accessRole) {
                console.error('Access role not found in the guild.');
                return await interaction.channel.send({
                    content: `✅ Reddit check passed for ${user}, but the **access** role is missing from the server.`,
                });
            }

            await member.roles.add(accessRole);
            console.log(`Assigned "access" role to ${user.tag}`);

            await interaction.channel.send({
                content: `🔍 **Reddit Check Results for ${user}**\n✅ Access granted! You can now close the ticket and enjoy.`,
            });
        } else {
            await interaction.channel.send({
                content: `🔍 **Reddit Check Results for ${user}**\n❌ Requirements not met. Please contact a moderator.`,
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        return interaction.editReply({
            content: `❌ Failed to fetch Reddit profile for ${userData.redditUsername}.`,
            ephemeral: true
        });
    }
};