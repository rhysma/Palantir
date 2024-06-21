const serverSchema = require('../../models/serverSchema.js');
const userSchema = require('../../models/userSchema.js');

module.exports = async (interaction) => {
    await interaction.deferReply({ephemeral: true});
    if (!interaction.guild) return interaction.editReply("Can only run this in a server!");
    
    let role = interaction.options.getRole('role');
    let oldRole;

    let serverData = await serverSchema.findOne({guildId: interaction.guild.id});
    if (!serverData) {
        serverData = await serverSchema.create({
            guildId: interaction.guild.id,
            redditRole: role.id,
        });
        console.log(`Created new server schema: ${interaction.guild.name} (${interaction.guild.id})`);
    }
    else {
        oldRole = serverData.redditRole;
        serverData.redditRole = role.id;
    }
    await serverData.save();

    let server = interaction.guild;
    userSchema.find({}, (err, users) => {
        if (err) return console.log(err);

        users.forEach(async user => {
            let member = server.members.cache.get(user.userId);
            if (!member) return;
            
            try {
                if (oldRole) await member.roles.remove(oldRole);
                await member.roles.add(role.id);
            }  
            catch (err) {
                await interaction.editReply({content: "An error was encountered in assigning the roles! Make sure to check my permissions."});
            }
        });
    });

    await interaction.editReply({content: `All set! Users who link their Reddit will now have the ${role} role`});
}