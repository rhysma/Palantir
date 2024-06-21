const { EmbedBuilder } = require('discord.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {

        let oldNickname = oldMember.nickname ?? oldMember.user.username;
        let newNickname = newMember.nickname ?? oldMember.user.username;
        if (oldNickname == newNickname) return;

        // Fetch & check information about server from database
        const serverData = await serverSchema.findOne({guildId: oldMember.guild.id});
        if (!serverData?.logChannelId) return;

        const guild = await client.guilds.cache.get(oldMember.guild.id);
        const channel = await guild.channels.fetch(serverData.logChannelId);
        
        try {
            channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({
                            name: `${oldMember.user.tag} changed their nickname`, 
                            iconURL: newMember.user.displayAvatarURL()
                        })
                        .setTitle(`\`${oldNickname}\` **→** \`${newNickname}\``)
                        .setColor('#fab725')
                ]
            });
        } 
        catch (e) {}
    }
}