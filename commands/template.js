const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs'); 
const path = require('path'); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Grabs the template from a clothing asset.')
    .addStringOption(option => 
      option.setName('assetid')
        .setDescription('The asset id you want to get a template for, shirt/tshirt/pants.')
        .setRequired(true)
    ),
  async execute(interaction) {
    const assetid = interaction.options.getString('assetid');

    if (!/^\d+$/.test(assetid)) {
      return interaction.followUp("Invalid asset id.");
    }

    try {
      const assetDetailsResponse = await axios.get(`https://economy.roblox.com/v2/assets/${assetid}/details`);
      const assetDetails = assetDetailsResponse.data;
      const assetTypeId = assetDetails.AssetTypeId;
      const assetName = assetDetails.Name;
      const creatorId = assetDetails.Creator.CreatorTargetId;
      const creatorName = assetDetails.Creator.Name;
      const creatorType = assetDetails.Creator.CreatorType; 

      let assetType = "Unknown";
      if (assetTypeId === 11) {
        assetType = "Shirt";
      } else if (assetTypeId === 12) {
        assetType = "Pants";
      } else if (assetTypeId === 2) {
        assetType = "T-Shirt";
      } else {
        return interaction.followUp("This is an invalid asset type.");
      }

      const assetLocationResponse = await axios.get(`https://assetdelivery.roblox.com/v2/asset/?id=${assetid}`, {
        headers: {
          "sec-ch-ua": "\"Not)A;Brand\";v=\"99\", \"Brave\";v=\"127\", \"Chromium\";v=\"127\"",
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": "\"Windows\""
        },
        referrer: "https://www.roblox.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
      });

      const assetLocation = assetLocationResponse.data.locations[0].location;

      const templateResponse = await axios.get(assetLocation);
      const templateXml = templateResponse.data;

      const templateIdMatch = templateXml.match(/<url>http:\/\/www\.roblox\.com\/asset\/\?id=(\d+)<\/url>/);
      if (!templateIdMatch) {
        return interaction.followUp("Failed to extract template ID.");
      }
      const templateId = templateIdMatch[1];

      const imageResponse = await axios.get(`https://assetdelivery.roblox.com/v1/asset/?id=${templateId}`, {
        responseType: 'arraybuffer' 
      });
      const imageBuffer = imageResponse.data;

      const tempFilePath = path.join(__dirname, '../temp', `${templateId}.png`); 
      fs.writeFileSync(tempFilePath, imageBuffer);

      const embed = new EmbedBuilder()
        .setTitle(assetName)
        .setColor('#4285F4')
        .setDescription(`Made by ${creatorType === 'Group' ? `[${creatorName}](https://www.roblox.com/groups/${creatorId})` : `[${creatorName}](https://www.roblox.com/users/${creatorId}/profile)`}`)
        .setURL(`https://www.roblox.com/catalog/${assetid}`)
        .setFooter({ text: "Make sure to open image as original."}) 
        .addFields(
          { name: "Image ID", value: templateId, inline: true },
          { name: "Asset ID", value: assetid, inline: true },
          { name: "Asset Type", value: assetType, inline: true }
        )
        .setImage(`attachment://${templateId}.png`); 

      await interaction.followUp({
        embeds: [embed],
        files: [tempFilePath]
      });

      fs.unlinkSync(tempFilePath); 
    } catch (error) {
      console.error(error); 
      interaction.followUp("An error occurred while processing your request."); 
    }
  },
};