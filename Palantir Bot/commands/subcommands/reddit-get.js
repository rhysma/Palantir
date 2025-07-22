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

    //only allow run by administrator
    if (!interaction.memberPermissions?.has('Administrator')) {
    return await interaction.editReply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true,
    });
}

    // setup variables 
    let user = interaction.options.getUser('user');
    let userData = await userSchema.findOne({ userId: user.id });
   
    // check if user has link reddit yet
    if (!userData?.redditUsername) {
        console.log(`${user} has not linked their Reddit username!`);
        return await interaction.editReply({ content: `${user} has not linked their Reddit username!`, ephemeral: true });
    }

    try {

        console.log("Reddit Username:", userData.redditUsername);

        // grab userdata from reddit api
        let redditData;
        try {
            redditData = await redditUserCheck(userData.redditUsername, interaction);
        } catch (err) {
            return err.message;
        }

        // check user's membership in reddit
        let redditMembership = await checkRedditMembership(userData.redditUsername);

        // build embed
        let embed = await embedBuilder(user, redditData, redditMembership);

        // Check requirements for role assignment
        if (redditData.total_karma >= 100 && redditMembership) {
            // Find the "access" role in the guild
            const guild = interaction.guild;
            const member = await guild.members.fetch(user.id);
            const accessRole = guild.roles.cache.find(role => role.name.toLowerCase() === 'access');

            if (!accessRole) {
                console.error('Access role not found in the guild.');
                return await interaction.editReply({
                    content: 'Reddit data retrieved, but the "access" role was not found in this server.',
                    ephemeral: true,
                });
            }

            // Assign the role to the user
            await member.roles.add(accessRole);
            console.log(`Assigned "access" role to ${user.tag}`);

            // Notify user via DM
            try {
                await user.send(`✅ You have met the requirements and have been granted access to the server! You can now close this ticket.`);
            } catch (dmErr) {
                console.warn(`Could not send DM to ${user.tag}:`, dmErr.message);
            }
        } else {
            console.log(`User does not meet requirements: karma=${redditData.total_karma}, membership=${redditMembership}`);
            return await interaction.editReply({
                content: `❌ You do not meet the requirements for access. Please contact a moderator for assistance.`,
                ephemeral: true,
            });
        }

        // build return message
        interaction.editReply({
            embeds: [embed],
            ephemeral: true,
        });
    } catch (error) {
        console.error('Error:', error.message);
        return interaction.editReply({ content: `Failed to fetch Reddit profile for ${userData.redditUsername}.`, ephemeral: true });
    }
};