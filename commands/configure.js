const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configure')
        .setDescription('Configure bot settings (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('logs')
            .setDescription('Configure output channel to log user updates')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel that user updates will appear')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Enable logs in this channel (true by default)')
            ),
        )
        .addSubcommand(subcommand => subcommand
            .setName('reddit-role')
            .setDescription('Configure the role that will be assigned to users who link their Reddit profile (admin only)')
            .addRoleOption(option => option
                .setName('role')
                .setDescription('Role for linked users')
                .setRequired(true)
            )
        ),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply("Can only run this in a server!");
        
        let subcommand = interaction.options.getSubcommand();
        require(`./subcommands/configure-${subcommand}.js`)(interaction);
    }
}