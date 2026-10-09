const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const userSchema = require('../models/userSchema.js');
const serverSchema = require('../models/serverSchema.js');

// Escape a string for safe use inside a RegExp.
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sendLog(interaction, client, description) {
    const serverData = await serverSchema.findOne({ guildId: interaction.guild?.id });
    if (!serverData?.logChannelId) return;

    try {
        const guild = await client.guilds.cache.get(interaction.guild.id);
        const logChannel = await guild.channels.fetch(serverData.logChannelId);

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `${interaction.user.tag} unlinked a Reddit account`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setDescription(description)
            .setColor('Red')
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Failed to send log for unset action:', err.message);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unset')
        .setDescription('Remove a linked Reddit username (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub
                .setName('member')
                .setDescription('Unlink by picking the Discord member')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('The user whose Reddit account will be unlinked')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('reddit-username')
                .setDescription('Unlink by Reddit username (use when the member has left or deleted their account)')
                .addStringOption(option =>
                    option
                        .setName('username')
                        .setDescription('The Reddit username to unlink, without u/')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.memberPermissions?.has('Administrator')) {
            return await interaction.editReply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'member') {
            const targetUser = interaction.options.getUser('target');
            const userRecord = await userSchema.findOne({ userId: targetUser.id });

            if (!userRecord?.redditUsername) {
                return await interaction.editReply({
                    content: `ℹ️ ${targetUser.tag} does not currently have a Reddit username linked.`,
                    ephemeral: true
                });
            }

            const oldUsername = userRecord.redditUsername;
            await userSchema.deleteOne({ userId: targetUser.id });

            await interaction.editReply({
                content: `✅ Successfully unlinked \`u/${oldUsername}\` from ${targetUser.tag} and removed their data.`,
                ephemeral: true
            });

            await sendLog(interaction, client,
                `❌ Unlinked \`u/${oldUsername}\` from ${targetUser.tag} (document deleted)`);
            return;
        }

        if (subcommand === 'reddit-username') {
            const rawUsername = interaction.options.getString('username').trim().replace(/^u\//i, '');

            // Reddit usernames are case-insensitive, but stored casing can vary
            // depending on how they were captured, so match case-insensitively.
            const pattern = new RegExp(`^${escapeRegex(rawUsername)}$`, 'i');
            const matches = await userSchema.find({ redditUsername: pattern });

            if (matches.length === 0) {
                return await interaction.editReply({
                    content: `ℹ️ No linked record found for \`u/${rawUsername}\`.`,
                    ephemeral: true
                });
            }

            if (matches.length > 1) {
                // Shouldn't happen if a username can only be linked once, but
                // don't guess which one to delete if it does.
                const ids = matches.map(m => `\`${m.userId}\``).join(', ');
                return await interaction.editReply({
                    content: `⚠️ Found ${matches.length} records linked to \`u/${rawUsername}\` (${ids}). Not deleting automatically — please resolve this manually.`,
                    ephemeral: true
                });
            }

            const record = matches[0];
            const oldUsername = record.redditUsername;
            const oldUserId = record.userId;

            await userSchema.deleteOne({ _id: record._id });

            await interaction.editReply({
                content: `✅ Successfully unlinked \`u/${oldUsername}\` (was linked to Discord ID \`${oldUserId}\`) and removed their data.`,
                ephemeral: true
            });

            await sendLog(interaction, client,
                `❌ Unlinked \`u/${oldUsername}\` from Discord ID \`${oldUserId}\` by Reddit username lookup (document deleted)`);
            return;
        }
    }
};