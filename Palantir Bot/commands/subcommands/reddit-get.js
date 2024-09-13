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

// MongoDB Atlas connection
const uri = process.env.mongoURL;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

require('dotenv').config();

module.exports = async (interaction) => {
    await interaction.deferReply({ ephemeral: true });

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

        // build embed
        let embed = await embedBuilder(user, redditData, userData.redditUsername);

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