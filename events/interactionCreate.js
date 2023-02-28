module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isCommand) return;
        const command = client.commands.get(interaction.commandName);
    
        command.execute(interaction, client);
    }
}