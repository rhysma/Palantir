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

        if (!interaction.memberPermissions?.has('Administrator')) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser('target');
        const userRecord = await userSchema.findOne({ userId: targetUser.id });

        if (!userRecord?.redditUsername) {
            return await interaction.editReply({
                content: `ℹ️ ${targetUser.tag} does not currently have a Reddit username linked.`,
                ephemeral: true
            });
        }

        const oldUsername = userRecord.redditUsername;

        // ✅ Delete the entire document
        await userSchema.deleteOne({ userId: targetUser.id });

        await interaction.editReply({
            content: `✅ Successfully unlinked \`u/${oldUsername}\` from ${targetUser.tag} and removed their data.`,
            ephemeral: true
        });

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
                    .setDescription(`❌ Unlinked \`u/${oldUsername}\` from ${targetUser.tag} (document deleted)`)
                    .setColor('Red')
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] });
            } catch (err) {
                console.error('Failed to send log for unset action:', err.message);
            }
        }
    }
};
