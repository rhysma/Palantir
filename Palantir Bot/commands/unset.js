const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const userSchema = require('../models/userSchema.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unset')
        .setDescription('Remove a user’s linked Reddit username (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The user whose Reddit account will be unlinked')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        // Ensure only admins can run this (redundant but safe)
        if (!interaction.memberPermissions?.has('Administrator')) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('target');
        const userData = await userSchema.findOne({ userId: targetUser.id });

        if (!userData?.redditUsername) {
            return await interaction.editReply({
                content: `ℹ️ ${targetUser.tag} does not currently have a Reddit username linked.`,
                ephemeral: true
            });
        }

        const oldUsername = userData.redditUsername;
        userData.redditUsername = null;
        await userData.save();

        await interaction.editReply({
            content: `✅ Successfully unlinked \`u/${oldUsername}\` from ${targetUser.tag}.`,
            ephemeral: true
        });

        // Log the change if log channel is configured
        const serverData = await serverSchema.findOne({ guildId: interaction.guild?.id });
        if (serverData?.logChannelId) {
            try {
                const guild = await client.guilds.cache.get(interaction.guild.id);
                const logChannel = await guild.channels.fetch(serverData.logChannelId);

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${interaction.user.tag} unlinked a Reddit account`,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .setDescription(`❌ Unlinked \`u/${oldUsername}\` from ${targetUser.tag}`)
                    .setColor('Red')
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            } catch (err) {
                console.error('Failed to send log for unset action:', err.message);
            }
        }
    }
};

