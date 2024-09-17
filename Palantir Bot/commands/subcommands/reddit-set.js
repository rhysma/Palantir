const path = require('path');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv

const { EmbedBuilder } = require('discord.js');
const request = require('request-promise');
const serverSchema = require('../../models/serverSchema.js');
const userSchema = require('../../models/userSchema.js');
const redditUserCheck = require('../../functions/reddit-user-check.js');
const checkRedditMembership = require('../../functions/checkRedditMembership.js');

require('dotenv').config();

module.exports = async (interaction, client) => {
    await interaction.deferReply({ ephemeral: true });
    
    // // setup variables
    let username = interaction.options.getString('username').toLowerCase().replace('u/','');
    let userData = await userSchema.findOne({userId: interaction.user.id});
    let serverData = await serverSchema.findOne({guildId: interaction.guild?.id});

    // check if username is already set to the same
    if (username == userData?.redditUsername) {
        return interaction.editReply({content: `Your username is already set to ${username}!`, ephemeral: true});
    }

    // check if username is in user by others
    let existingUser = await userSchema.findOne({ redditUsername: username });
    if (existingUser) {
        return interaction.editReply({content: "Someone already has this username! Contact a mod if this is an issue.", ephemeral: true});
    }
    
    // grab userdata from reddit api
    let redditData;
    try {
        redditData = await redditUserCheck(username, interaction);
    } catch (err) {
        return err.message;
    } 


    // check user's membership in reddit
    let redditMembership = await checkRedditMembership(username);

    // build return messages
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
    }

    // set user role for access
    /*
    if (serverData?.redditRole && redditMembership && redditData.total_karma >= 100) {
        interaction.member?.roles.add(serverData.redditRole);
    }
    */

    // save userdata to database
    userData.save();

    // log changes to log channel
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