const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const axios = require('axios');
/**
 * slashcommand for webhooks a nd shit
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('webhook')
    .setDescription('Tells you information about a Discord Webhook and allows you to delete it.')
    .addStringOption(option =>
      option.setName('webhook_link')
      .setDescription('The Webhook Link')
      .setRequired(true)
    ),
  async execute(interaction) {
    const webhookLink = interaction.options.getString('webhook_link');

    const webhookRegex = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+(\/.*)?$/;

    if (!webhookRegex.test(webhookLink)) {
      return interaction.followUp('Invalid webhook link.');
    }

    try {
      const response = await axios.get(webhookLink);
      const webhookData = response.data;

      let currentPage = 1;
      let widgetData = null;
      let inviteData = null; 

      try {
        const widgetResponse = await axios.get(`https://discord.com/api/guilds/${webhookData.guild_id}/widget.json`);
        widgetData = widgetResponse.data; 

        if (widgetData.instant_invite) {
          const inviteCode = widgetData.instant_invite.split('/').pop();
          const inviteResponse = await axios.get(`https://discord.com/api/v9/invites/${inviteCode}?with_counts=true&with_expiration=true`);
          inviteData = inviteResponse.data;
        }

      } catch (error) {
        console.log('Error fetching widget or invite data:', error); 
      }

      const webhookEmbed = new EmbedBuilder()
        .setTitle(webhookData.name)
        .setColor(4359668)
        .setThumbnail(webhookData.avatar ? `https://cdn.discordapp.com/avatars/${webhookData.id}/${webhookData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/1.png')
        .addFields(
          { name: 'Channel Id', value: `${webhookData.channel_id}\n<#${webhookData.channel_id}>` },
          { name: 'Guild Id', value: webhookData.guild_id },
        );

      const serverEmbedFields = [
        { name: 'Server Name', value: inviteData ? inviteData.guild.name : 'Widget Disabled', inline: true },
        { name: 'Invite Link', value: widgetData ? widgetData.instant_invite : 'Widget Disabled', inline: true },
        { name: 'Member Count', value: inviteData ? `${inviteData.approximate_member_count} members` : 'N/A', inline: true },
      ];

      if (inviteData && inviteData.guild.description && inviteData.guild.description.trim() !== '') {
        serverEmbedFields.push({ 
          name: 'Description', 
          value: inviteData.guild.description, 
          inline: false
        });
      }

      const serverEmbed = new EmbedBuilder() 
        .setTitle(`Server Information: ${inviteData ? inviteData.guild.name : 'Unavailable'}`)
        .setColor(4359668)
        .setThumbnail(inviteData && inviteData.guild.icon ? `https://cdn.discordapp.com/icons/${inviteData.guild.id}/${inviteData.guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/1.png')
        .addFields(serverEmbedFields);

      const deleteButton = new ButtonBuilder()
        .setCustomId('deleteWebhook')
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);

      const previousButton = new ButtonBuilder()
        .setCustomId('previousPage')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true); 

      const nextButton = new ButtonBuilder()
        .setCustomId('nextPage')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!widgetData); 

      const row = new ActionRowBuilder()
        .addComponents(previousButton, nextButton, deleteButton);

      const message = await interaction.followUp({ 
        embeds: [webhookEmbed], 
        components: [row] 
      });

      const collector = message.createMessageComponentCollector({ 
        filter: i => i.user.id === interaction.user.id, 
      });
      
      collector.on('collect', async i => {
        if (i.customId === 'deleteWebhook') {
          try {
            await axios.delete(webhookLink);
            return await interaction.followUp('Webhook successfully deleted!');
          } catch (deleteError) {
            return await interaction.followUp('Error deleting webhook.');
          }
        } else if (i.customId === 'nextPage') {
          currentPage = 2;
          await i.update({ 
            embeds: [serverEmbed], 
            components: [
              new ActionRowBuilder().addComponents(
                previousButton.setDisabled(false),
                nextButton.setDisabled(true),
                deleteButton
              )
            ] 
          });
          // await i.deferUpdate();
          // todo: wait for update deferral to be implemented such that we have deleteWebhook method
        } else if (i.customId === 'previousPage') {
          currentPage = 1;
          await i.update({ 
            embeds: [webhookEmbed], 
            components: [
              new ActionRowBuilder().addComponents(
                previousButton.setDisabled(true),
                nextButton.setDisabled(!widgetData),
                deleteButton
              )
              // new ActionRowBuilder
            ] 
          });
        }
      });
    } catch (error) {
      return interaction.followUp('Invalid webhook URL or unable to access webhook information.');
    }
  },
};