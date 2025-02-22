const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

async function loadWhitelist() {
  try {
    const whitelistData = fs.readFileSync('./whitelist.json', 'utf-8');
    return JSON.parse(whitelistData);
  } catch (err) {
    console.error("Error loading whitelist:", err);
    return []; 
  }
}

async function saveWhitelist(whitelist) {
  try {
    const whitelistData = JSON.stringify(whitelist, null, 2);
    fs.writeFileSync('./whitelist.json', whitelistData, 'utf-8');
  } catch (err) {
    console.error("Error saving whitelist:", err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the command whitelist.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user ID to the whitelist.')
        .addStringOption(option =>
          option
            .setName('userid')
            .setDescription('The user ID to whitelist.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user ID from the whitelist.')
        .addStringOption(option =>
          option
            .setName('userid')
            .setDescription('The user ID to remove.')
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      return interaction.followUp({ content: "You are not permitted to use this command!", ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const userIdToAdd = interaction.options.getString('userid').replace('<@', '').replace('>', '');
      let whitelist = await loadWhitelist();

      if (whitelist.includes(userIdToAdd)) {
        return interaction.followUp({ content: 'User is already whitelisted!', ephemeral: true });
      }

      whitelist.push(userIdToAdd);
      await saveWhitelist(whitelist);
      return interaction.followUp({ content: `User <@${userIdToAdd}> has been added to the whitelist!`, ephemeral: true });

    } else if (subcommand === 'remove') {
      const userIdToRemove = interaction.options.getString('userid').replace('<@', '').replace('>', '');
      let whitelist = await loadWhitelist();

      if (!whitelist.includes(userIdToRemove)) {
        return interaction.followUp({ content: 'User is not on the whitelist!', ephemeral: true });
      }

      whitelist = whitelist.filter(id => id !== userIdToRemove);
      await saveWhitelist(whitelist);
      return interaction.followUp({ content: `User <@${userIdToRemove}> has been removed from the whitelist!`, ephemeral: true });
    } 
  },
};