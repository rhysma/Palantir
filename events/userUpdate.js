const { EmbedBuilder } = require('discord.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = {
    name: 'userUpdate',
    async execute(oldUser, newUser, client) {
        if (oldUser.tag == newUser.tag) return;

        // Iterate over all guilds and check if user is in it
        client.guilds.cache.forEach(async (guild) => {
            if (!guild.members.cache.has(newUser.id)) return;

            // Fetch & check information about server from database
            const serverData = await serverSchema.findOne({guildId: guild.id});
            if (!serverData?.logChannelId) return;

            const channel = await guild.channels.fetch(serverData.logChannelId);

            try {
                channel.send({ 
                    embeds: [
                        new EmbedBuilder()
                            .setAuthor({
                                name: `${oldUser.tag} changed their Discord ${
                                    (oldUser.username == newUser.username) ? "tag" : "username"
                                }`, 
                                iconURL: newUser.displayAvatarURL()
                            })
                            .setTitle(`\`${oldUser.tag}\` **→** \`${newUser.tag}\``)
                            .setColor('#ffcd59')
                    ]
                });
            } catch(e){}
        })
    }
}