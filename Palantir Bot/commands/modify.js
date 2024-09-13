const path = require('path');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const request = require('request-promise');
const serverSchema = require('../models/serverSchema.js');
const userSchema = require('../models/userSchema.js');
const redditUserCheck = require('../functions/reddit-user-check.js');
const embedBuilder = require('../functions/embedBuilder.js');

require('dotenv').config();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('modify')
		.setDescription("Change a user's Reddit username (admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => option
            .setName('user')
            .setDescription('The Discord user')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('username')
            .setDescription('The Reddit username')
            .setMinLength(3)
            .setMaxLength(22)
            .setRequired(true)
        ),

	async execute(interaction, client) {
        await interaction.deferReply({ephemeral: true});
        if (!interaction.guild) return interaction.editReply("Can only run this in a server!");

        // setup variables
        const user = interaction.options.getUser('user');
        const username = interaction.options.getString('username').toLowerCase().replace('u/','');
        let userData = await userSchema.findOne({userId: user.id});
        let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
        
        // check if username is already set to the same
        if (username == userData?.redditUsername) {
            return interaction.editReply({content: "This is already this user's Reddit username!", ephemeral: true});
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


        let embed = await embedBuilder(user, redditData, userData.redditUsername);

        // build return messages
        let logMessage;
        if (userData?.redditUsername) {
            interaction.editReply({
                content: `Changed ${user}'s Reddit username from **u/${userData.redditUsername}** to **u/${username}**`, 
                ephemeral: true, 
                embeds: [embed]
            });
            logMessage = `\`u/${userData.redditUsername}\` → \`u/${username}\``;
            userData.redditUsername = username;
        }
        else {
            interaction.editReply({
                content: `Got it! ${user}'s Reddit username is **u/${username}**`, 
                ephemeral: true, 
                embeds: [embed]
            });
            logMessage = `\`u/${username}\``;
                
            userData = await userSchema.create({
                userId: user.id,
                redditUsername: username
            });
            console.log(`Created new user schema: ${user.tag}`);
        
            let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
            /*
            if (serverData?.redditRole) {
                interaction.member?.roles.add(serverData.redditRole);
            }
            */
        }

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
                        name: `${user.tag}'s Reddit username was changed`, 
                        iconURL: user.displayAvatarURL()
                    })
                    .setTitle(logMessage)
                    .setColor('#ff5700')
                    .setFooter({
                        text: `Username changed by ${interaction.user.tag}`, 
                        iconURL: interaction.user.displayAvatarURL()
                    })
            ]
        });
    }
};
