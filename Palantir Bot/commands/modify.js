const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const request = require('request-promise');
const serverSchema = require('../models/serverSchema.js');
const userSchema = require('../models/userSchema.js');

function formatTimeDifference(date1, date2) {
    let years = date2.getYear() - date1.getYear();
    let months = date2.getMonth() - date1.getMonth();
	let days = date2.getDate() - date1.getDate();
  
	if (days < 0) {
        days += 31;
  		months--;
    }

    if (months < 0) {
        months += 12;
        years--;
    }

    let result = [];
    if (years) result.push(`${years} year${(years > 1) ? 's' : ''}`);
    if (months) result.push(`${months} month${(months > 1) ? 's' : ''}`);
    if (days) result.push(`${days} day${(days > 1) ? 's' : ''}`);

    if (result.length == 3) return `${result[0]}, ${result[1]} and ${result[2]}`;
    if (result.length == 2) return `${result[0]} and ${result[1]}`;
    return result[0];
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('modify')
		.setDescription("Change a user's Reddit username (admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => option
            .setName('user')
            .setDescription('The Discord user')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('username')
            .setDescription('The Reddit username')
            .setMinLength(3)
            .setMaxLength(22)
            .setRequired(true)
        ),

	async execute(interaction, client) {
        await interaction.deferReply({ephemeral: true});
        if (!interaction.guild) return interaction.editReply("Can only run this in a server!");

        const user = interaction.options.getUser('user');
        const username = interaction.options.getString('username').toLowerCase().replace('u/','');
        let userData = await userSchema.findOne({userId: user.id});
        let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
    
        if (username == userData?.redditUsername) {
            return interaction.editReply({content: "This is already this user's Reddit username!", ephemeral: true});
        }

        let existingUser = await userSchema.findOne({ redditUsername: username });
        if (existingUser) {
            return interaction.editReply({content: "Someone already has this username! Contact a mod if this is an issue.", ephemeral: true});
        }
            
        let redditData;
        try {
            let body = await request({
                url: `https://www.reddit.com/user/${username}/about.json`,
                headers: {
                    'User-Agent': 'PALANTIR-DISCORD-BOT'
                }
            });
            redditData = JSON.parse(body).data;
        }
        catch(err) {
            return interaction.editReply({content: "This Reddit profile doesn't exist!", ephemeral: true});
        }

        let dateCreated = new Date(redditData.created_utc * 1000);
        const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
        let formattedDate = `${months[dateCreated.getMonth()]} ${dateCreated.getDate()}, ${dateCreated.getFullYear()}`;

        let embed = new EmbedBuilder()
            .setAuthor({
                name: `${user.tag}'s Reddit profile`, 
                iconURL: user.displayAvatarURL()
            })
            .setTitle(redditData.subreddit.display_name_prefixed)
            .setURL(`https://reddit.com${redditData.subreddit.url}`)
            .addFields([
                {
                    name: (redditData.subreddit.title.length) ? redditData.subreddit.title : redditData.name, 
                    value: `${(redditData.subreddit.public_description.length) ? `*"${redditData.subreddit.public_description}"*\n` : ''}
                        🌟 **${redditData.total_karma}** karma`, inline: true },
            ])
            .setThumbnail(redditData.subreddit.icon_img.split('?')[0])
            .setColor('#ff5700')
            .setFooter({text: `🍰 Account created ${formattedDate} \n${formatTimeDifference(dateCreated, new Date())} ago`});


        let logMessage;
        if (userData?.redditUsername) {
            interaction.editReply({
                content: `Changed ${user}'s Reddit username from **u/${userData.redditUsername}** to **u/${username}**`, 
                ephemeral: true, embeds: [embed]
            });
            logMessage = `\`u/${userData.redditUsername}\` → \`u/${username}\``;
            userData.redditUsername = username;
        }
        else {
            interaction.editReply({
                content: `Got it! ${user}'s Reddit username is **u/${username}**`, 
                ephemeral: true, embeds: [embed]
            });
            logMessage = `\`u/${username}\``;
                
            userData = await userSchema.create({
                userId: user.id,
                redditUsername: username
            });
            console.log(`Created new user schema: ${user.tag}`);
        
            let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
            if (serverData?.redditRole) {
                let member = interaction.guild.members.cache.get(user.id);
                member?.roles.add(serverData.redditRole);
            }
        }

        userData.save();
        

        if (!serverData?.logChannelId) return;
        const guild = await client.guilds.cache.get(interaction.guild.id);
        const channel = await guild.channels.fetch(serverData.logChannelId);
        
        channel.send({
            embeds: [
                new EmbedBuilder()
                    .setAuthor({
                        name: `${user.tag}'s Reddit username was changed`, 
                        iconURL: user.displayAvatarURL()
                    })
                    .setTitle(logMessage)
                    .setColor('#ff5700')
                    .setFooter({
                        text: `Username changed by ${interaction.user.tag}`, 
                        iconURL: interaction.user.displayAvatarURL()
                    })
            ]
        });
    }
};
