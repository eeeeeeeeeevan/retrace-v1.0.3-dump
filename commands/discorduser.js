const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

let globalCooldown = 0;

async function loadWhitelist() {
  try {
    const whitelistData = fs.readFileSync('./whitelist.json', 'utf-8');
    return JSON.parse(whitelistData);
  } catch (err) {
    console.error("Error loading whitelist:", err);
    return [];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('discorduser')
    .setDescription('Checks if the Discord username is available. (You can separate by commas, 15 max)')
    .addStringOption(option =>
      option.setName('usernames')
      .setDescription('The username(s) to check.')
      .setRequired(true)
    ),
  async execute(interaction) {
    const whitelist = await loadWhitelist();

    if (!whitelist.includes(interaction.user.id)) return interaction.followUp('You\'re not whitelisted to use this command!')

    if (globalCooldown > Date.now()) {
      const timeLeft = Math.ceil((globalCooldown - Date.now()) / 1000);
      return interaction.reply({
        content: `This command is rate limited globally. Please try again in ${timeLeft} seconds.`,
        ephemeral: true
      });
    }

    let usernames = interaction.options.getString('usernames').split(',').map(u => u.trim());

    if (usernames.length > 15) {
      usernames = usernames.slice(0, 15);
    }

    const taken = [];
    const untaken = [];
    let rateLimited = false;

    const checkUsername = async (username, delay) => {
      await new Promise(resolve => setTimeout(resolve, delay));

      if (rateLimited) return;

      try {
        const response = await axios({
          method: 'post',
          url: 'https://discord.com/api/v9/users/@me/pomelo-attempt',
          headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "authorization": config.selfbotToken,
            "content-type": "application/json",
            "x-debug-options": "bugReporterEnabled",
            "x-discord-locale": "en-US",
            "x-discord-timezone": "America/Phoenix",
            "x-super-properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS8xLjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyNy4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTI3LjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiJodHRwczovL3NlYXJjaC5icmF2ZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6InNlYXJjaC5icmF2ZS5jb20iLCJyZWZlcnJlcl9jdXJyZW50IjoiIiwicmVmZXJyaW5nX2RvbWFpbl9jdXJyZW50IjoiIiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X2J1aWxkX251bWJlciI6MzIwNzA1LCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ==" 
          },
          data: JSON.stringify({ username: username })
        });
        // remove the super properties header for thisd shit 

        if (response.data.taken) {
          taken.push(username);
        } else {
          untaken.push(username);
        }

      } catch (error) {
        if (error.response && error.response.data && error.response.data.message && error.response.data.retry_after) {
          const rateLimitMessage = error.response.data.message;
          if (rateLimitMessage === 'The resource is being rate limited.') {
            console.log(`Rate limited!`);
            rateLimited = true;

            if (error.response.data.global) {
              globalCooldown = Date.now() + (error.response.data.retry_after * 1000);
            }
            interaction.followUp({
              content: `This command is rate limited. Please try again in ${error.response.data.retry_after} seconds.`,
              ephemeral: true
            });
          } 
        } else {
          console.error(`Error checking ${username}:`, error);
        }
      }
    };

    for (let i = 0; i < usernames.length; i++) {
      await checkUsername(usernames[i], i * 2000);
      if (rateLimited) break;
    }

    if (!rateLimited) {
      const embed = new EmbedBuilder()
        .setTitle('Discord Username Availability')
        .setColor(4359668)
        .setDescription(`\`\`\`diff\n+ Available\n${untaken.length > 0 ? untaken.join('\n') : 'None'}\n\n- Taken\n${taken.length > 0 ? taken.join('\n') : 'None'}\`\`\``);
      interaction.followUp({ embeds: [embed] });
    }
  },
};
