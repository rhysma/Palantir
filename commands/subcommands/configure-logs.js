const serverSchema = require('../../models/serverSchema.js');

module.exports = async (interaction) => {
    await interaction.deferReply();
    if (!interaction.guild) return interaction.editReply("Can only run this in a server!");
    
    let channel = interaction.options.getChannel('channel');
    let enabled = interaction.options.getBoolean('enabled') ?? true;

    let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
    if (!serverData) {
        serverData = await serverSchema.create({
            guildId: interaction.guild.id,
            logChannelId: channel.id,
        });
        console.log(`Created new server schema: ${interaction.guild.name} (${interaction.guild.id})`);
    }
    else {
        serverData.logChannelId = (enabled) ? channel.id : null;
    }
    
    await serverData.save();
    
    if (enabled) {
        interaction.editReply(`All set! ${channel} will now be the output channel for any nickname and username updates.`);
    }
    else {
        interaction.editReply(`All set! User updates are now **disabled**.`);
    }
}