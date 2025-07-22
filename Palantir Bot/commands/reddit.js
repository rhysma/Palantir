const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reddit')
		.setDescription('Get/set Reddit information')
        .addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription('Get Reddit username of a server member (admin only)')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The Discord user')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('set')
            .setDescription('Enter your Reddit username')
            .addStringOption(option => option
                .setName('username')
                .setDescription('Your Reddit username')
                .setMinLength(3)
                .setMaxLength(22)
                .setRequired(true)
            )
        ),
	async execute(interaction, client) {
        let subcommand = interaction.options.getSubcommand();
        require(`./subcommands/reddit-${subcommand}.js`)(interaction, client);
	},
};
