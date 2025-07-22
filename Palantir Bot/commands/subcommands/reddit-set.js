const path = require('path');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');
const { EmbedBuilder } = require('discord.js');
const request = require('request-promise');
const serverSchema = require('../../models/serverSchema.js');
const userSchema = require('../../models/userSchema.js');
const redditUserCheck = require('../../functions/reddit-user-check.js');
const checkRedditMembership = require('../../functions/checkRedditMembership.js');

require('dotenv').config();

module.exports = async (interaction, client) => {
    await interaction.deferReply({ ephemeral: true });

    //const username = interaction.options.getString('username').toLowerCase().replace('u/', '');
    let rawUsername = interaction.options.getString('username');
const username = rawUsername
    .toLowerCase()
    .trim()
    .replace(/^u\/?/, '')        // Remove "u/" or "u" if present
    .replace(/^@/, '');          // Remove leading @ if they paste that too

    if (rawUsername !== username) {
    await interaction.followUp({
        content: `ℹ️ It looks like you entered **${rawUsername}** — I’ve cleaned it to **${username}** for you.`,
        ephemeral: true
    });
}

    const previousData = await userSchema.findOne({ userId: interaction.user.id });
    const serverData = await serverSchema.findOne({ guildId: interaction.guild?.id });

    if (username === previousData?.redditUsername) {
        return interaction.editReply({
            content: `Your username is already set to ${username}!`,
            ephemeral: true
        });
    }

    const existingUser = await userSchema.findOne({ redditUsername: username });
    if (existingUser && existingUser.userId !== interaction.user.id) {
        return interaction.editReply({
            content: "❌ Someone already has this Reddit username! Contact a mod if this is an issue.",
            ephemeral: true
        });
    }

    // Fetch Reddit data
    let redditData;
    try {
        redditData = await redditUserCheck(username, interaction);
    } catch (err) {
        return interaction.editReply({
            content: `❌ Error retrieving Reddit profile for u/${username}.`,
            ephemeral: true
        });
    }

    const redditMembership = await checkRedditMembership(username);
    const passedRequirements = redditData.total_karma >= 100 && redditMembership;

    // Log and reply message
    const replyContent = previousData?.redditUsername
        ? `🔁 Changed your Reddit username from **u/${previousData.redditUsername}** to **u/${username}**.`
        : `✅ Got it! Your Reddit username is now **u/${username}**.`;

    const logMessage = previousData?.redditUsername
        ? `\`u/${previousData.redditUsername}\` → \`u/${username}\``
        : `\`u/${username}\``;

    await userSchema.findOneAndUpdate(
        { userId: interaction.user.id },
        { redditUsername: username },
        { upsert: true, new: true }
    );

    await interaction.editReply({ content: replyContent, ephemeral: true });

    // Assign access role if eligible
    if (serverData?.redditRole && passedRequirements) {
        try {
            const guild = await client.guilds.cache.get(interaction.guild.id);
            const member = await guild.members.fetch(interaction.user.id);
            const role = await guild.roles.fetch(serverData.redditRole);

            if (role && member) {
                await member.roles.add(role);
                console.log(`✅ Assigned access role to ${interaction.user.tag}`);
            }
        } catch (err) {
            console.error(`❌ Failed to assign role to ${interaction.user.tag}:`, err.message);
        }
    } else {
        console.log(`User ${interaction.user.tag} did not meet requirements (karma: ${redditData.total_karma}, member: ${redditMembership})`);
    }

    // Public message
    await interaction.channel.send({
        content: `🔍 **Reddit Check Results for ${interaction.user}**\n` +
                 `${passedRequirements ? '✅ Access granted! You can now close the ticket and enjoy.' : '❌ Requirements not met. Please contact a moderator.'}`
    });

    // Log message
    if (serverData?.logChannelId) {
        const guild = await client.guilds.cache.get(interaction.guild.id);
        const channel = await guild.channels.fetch(serverData.logChannelId);

        await channel.send({
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
};
