const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('discord')
    .setDescription('Searches up a Discord user by their UserID')
    .addStringOption(option =>
      option.setName('userid')
      .setDescription('The UserID')
      .setRequired(true)
    ),
  async execute(interaction) {
    const userId = interaction.options.getString('userid').replace(/<@|>|\s/g, '');

    if (!/^\d{10,}$/.test(userId)) {
      return interaction.followUp({ content: 'Invalid UserID provided.', ephemeral: true });
    }

    try {
      const response = await axios.get(`https://discord.com/api/v9/users/${userId}`, {
        headers: {
          Authorization: `Bot ${config.token}`
        }
      });

      const userData = response.data;

      let embedTitle = 'Profile Information';
      if (userData.global_name && userData.global_name.trim() !== '') {
        embedTitle += ` (${userData.global_name})`;
      }

      const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setColor(4359668)
        .setThumbnail(userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}?size=1024` : 'https://cdn.discordapp.com/embed/avatars/1.png') 
        .addFields(
          { name: 'Username', value: `${userData.username.replace(/_/g, '\\_')}` },
          { name: 'ID', value: `${userData.id}` }
        );
      if (userData.banner && userData.banner.trim() !== '') embed.setImage(`https://cdn.discordapp.com/banners/${userData.id}/${userData.banner}?size=1024`);
      if (userData.clan && userData.clan.tag) embed.addFields({ name: 'Clan', value: userData.clan.tag })

      interaction.followUp({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching user data:', error);
      interaction.followUp({ content: 'An error occurred while fetching user data. Please try again later.', ephemeral: true });
    }
  },
};