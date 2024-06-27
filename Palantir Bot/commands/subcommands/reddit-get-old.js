
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.resolve(__dirname, '/home/ubuntu/discord_bot/Palantir/.env') });
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const request = require('request-promise');
const userSchema = require('../../models/userSchema.js');
const dotenv = require('dotenv');  // Import dotenv

dotenv.config();

let accessToken = process.env.access_token;

function formatTimeDifference(date1, date2) {
    let years = date2.getYear() - date1.getYear();
    let months = date2.getMonth() - date1.getMonth();
let days = date2.getDate() - date1.getDate();
  
    if (days < 0) 
    {
        days += 31;
        months--;
    }

    if (months < 0) 
    {
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

module.exports = async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    let user = interaction.options.getUser('user');
    let userData = await userSchema.findOne({userId: user.id});
    
    if (!userData?.redditUsername) {
        return await interaction.editReply({content: `${user} has not linked their Reddit username!`, ephemeral: true});
    }

    let redditData;
    try {
        let body = await request({
            url: `https://oauth.reddit.com/user/${userData.redditUsername}/about.json`,
            headers: {
                'User-Agent': 'PALANTIR-DISCORD-BOT',
        'Authorization': `Bearer ${accessToken}`

            }
        });
        redditData = JSON.parse(body).data;
    }
    catch (err) {
        if (err.statusCode === 401) 
        {
            // Access token expired, refresh it
            try 
            {
                const clientId = 'cD0dcoWi_FEfUu309W0lGQ';
                const clientSecret = 'XONEmbCJuOgdtxzlO6K7DkwOkyhFPg';

                const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

                const data = 'grant_type=client_credentials';

                axios.post('https://www.reddit.com/api/v1/access_token', data, {
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    },
                })
            .then(response => 
                {
                    accessToken = response.data.access_token;
                    console.log('Access Token:', accessToken);
                    console.log("New access token:", accessToken);
                    require('fs').writeFileSync('/home/ubuntu/discord_bot/Palantir/.env', `access_token=${accessToken}\n`, { flag: 'a' });

                    console.log('Token updated successfully!');   
                })
            .catch(error => 
                {
                    console.error('Error:', error.response ? error.response.data : error.message);

                    return interaction.editReply({content: `*${user.tag}* has set their Reddit username as *${userData.redditUsername}*, but their
                    Reddit profile could not be found.`, ephemeral: true});
     
                });
                
                // Now use the new access token to retry the original request
                let newBody = request({
                    url: `https://oauth.reddit.com/user/${userData.redditUsername}/about.json`,
                    headers: {
                        'User-Agent': 'PALANTIR-DISCORD-BOT',
                        'Authorization': `Bearer ${accessToken}`
                        }
                    });
                redditData = JSON.parse(newBody).data;
                // Update the token value

                console.log("New data fetched successfully:", redditData);

            } 
            catch (refreshErr) 
            {
                console.log("Error refreshing access token:", refreshErr.message);
                return interaction.editReply({content: `*${user.tag}* has set their Reddit username as *${userData.redditUsername}*, b
                ut their Reddit profile could not be found.`, ephemeral: true});
            }
        }
        else
        {
            const errorMessage = err.response?.data || err.message;
            console.error(`Error checking Reddit profile: ${errorMessage}`);
            return interaction.editReply({content: `*${user.tag}* has set their Reddit username as *${userData.redditUsername}*, but their
            Reddit profile could not be found.`, ephemeral: true});
        }
    }

    let dateCreated = new Date(redditData.created_utc * 1000);
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    let formattedDate = `${months[dateCreated.getMonth()]} ${dateCreated.getDate()}, ${dateCreated.getFullYear()}`;

    interaction.editReply({embeds: [
        new EmbedBuilder()
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
                         **${redditData.total_karma}** karma`, inline: true },
            ])
            .setThumbnail(redditData.subreddit.icon_img.split('?')[0])
            .setColor('#ff5700')
            .setFooter({text: ` Account created ${formattedDate} \n${formatTimeDifference(dateCreated, new Date())} ago`})
        ],
        ephemeral: true
    });

}