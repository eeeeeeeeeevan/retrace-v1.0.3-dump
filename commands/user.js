const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');
const fs = require('node:fs');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const getTimestamp = (date, style) => `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

const getRobloxData = async (userId) => {
  try {
    const [userData, lastOnlineResponse, presenceResponse] = await Promise.all([
      axios.get(`https://users.roblox.com/v1/users/${userId}`),
      axios.post('https://presence.roblox.com/v1/presence/last-online', { userIds: [userId] }),
      axios.post('https://presence.roblox.com/v1/presence/users', { userIds: [userId] }, {
        headers: {
          'Cookie': `.ROBLOSECURITY=${config.robloxCookie}`,
        }
      }),
    ]);

    const accountAgeDays = Math.floor((new Date() - new Date(userData.data.created)) / (1000 * 60 * 60 * 24)).toLocaleString();
    const lastLocation = presenceResponse.data.userPresences[0].lastLocation || 'N/A';
    let rap = 0;
    let value = 0;

    try {
      const rolimonsResponse = await axios.get(`https://api.rolimons.com/players/v1/playerinfo/${userId}`);
      if (rolimonsResponse.status === 200) {
        rap = rolimonsResponse.data.rap;
        value = rolimonsResponse.data.value;
      }
    } catch (e) {}

    let thumbnailUrl = '';
    let requestCount = 0;
    let backoffDelay = 500;

    while (requestCount < 5 && !thumbnailUrl) {
      try {
        const thumbnailResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=180x180&format=Png&isCircular=false`, { headers: { accept: 'application/json' } });
        if (thumbnailResponse.data.data[0].state == 'Blocked') {
          thumbnailUrl = "https://supers.lol/avis/ContentDeleted.jpg";
        } else {
          thumbnailUrl = thumbnailResponse.data.data[0].imageUrl;
        }
      } catch (error) {
        console.error('Error fetching thumbnail:', error);
      }

      if (!thumbnailUrl) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        backoffDelay *= 2;
      }
      requestCount++;
    }

    let lastOnline = lastOnlineResponse.data.lastOnlineTimestamps[0] ? new Date(lastOnlineResponse.data.lastOnlineTimestamps[0].lastOnline) : new Date(userData.data.created);

    if (lastOnline.getTime() === new Date(userData.data.created).getTime()) {
      try {
        const badgeResponse = await axios.get(`https://badges.roblox.com/v1/users/${userId}/badges?limit=10&sortOrder=Desc`);
        const firstBadgeId = badgeResponse.data.data[0]?.id;

        if (firstBadgeId) {
          try {
            const awardedDateResponse = await axios.get(`https://badges.roblox.com/v1/users/${userId}/badges/${firstBadgeId}/awarded-date`);
            lastOnline = new Date(awardedDateResponse.data.awardedDate);
          } catch (error) {
            console.error('Error fetching awarded date:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching badges:', error);
      }
    }

    lastOnline = lastOnline ? getTimestamp(lastOnline, 'D') : 'N/A'; 

    const placeId = presenceResponse.data.userPresences[0].placeId;
    let formattedLastLocation = lastLocation;
    if (placeId && placeId !== 0 && !isNaN(placeId)) {
      formattedLastLocation = `[${lastLocation}](https://roblox.com/games/${placeId})`;
    }

    return {
      userData: userData.data,
      accountAgeDays,
      lastOnline,
      lastLocation: formattedLastLocation,
      rap,
      value,
      thumbnailUrl
    };
  } catch (error) {
    console.error('Error fetching Roblox data:', error);
    throw error;
  }
};

const getVerificationStatus = async (userId) => {
  try {
    const hatId1Response = await axios.get(`https://inventory.roblox.com/v1/users/${userId}/items/0/102611803/is-owned`);
    if (hatId1Response.data) {
      return 'Hat';
    } else {
      const hatId2Response = await axios.get(`https://inventory.roblox.com/v1/users/${userId}/items/0/1567446/is-owned`);
      if (hatId2Response.data) {
        return 'Sign';
      }
    }
  } catch (error) {
    console.error('Error fetching verification status:', error);
    return 'False'; 
  }
  return 'False';
};

const getPremiumStatus = async (userId) => {
  try {
    const premiumResponse = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${userId}/validate-membership`, {
      headers: {
        accept: 'application/json',
        Cookie: `.ROBLOSECURITY=${config.robloxCookie}`,
      },
    });
    return premiumResponse.data ? 'True' : 'False';
  } catch (error) {
    console.error('Error fetching premium status:', error);
    return 'N/A'; 
  }
};

async function getAllPastUsernames(userId) {
  const uniqueUsernames = new Set();
  let nextPageCursor = null;

  do {
    let url = `https://users.roblox.com/v1/users/${userId}/username-history?limit=100&sortOrder=Asc`;
    if (nextPageCursor) {
      url += `&cursor=${nextPageCursor}`;
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'accept': 'application/json'
        }
      });

      const data = response.data;
      nextPageCursor = data.nextPageCursor;

      data.data.forEach(item => uniqueUsernames.add(item.name));

    } catch (error) {
      console.error(`Error fetching username history: ${error}`);
      break;
    }
  } while (nextPageCursor);
  return [...uniqueUsernames];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Shows you information about the Roblox user')
    .addStringOption((option) =>
      option
        .setName('input')
        .setDescription('The username or ID of the Roblox user.')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('is_id')
        .setDescription('True if input is a User ID. (Optional)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const input = interaction.options.getString('input');
    const isId = interaction.options.getBoolean('is_id') || false;

    try {
      let userId = input;
      if (!isId) {
        userId = await noblox.getIdFromUsername(input);
        if (typeof userId !== 'number') return await interaction.followUp('This user doesn\'t exist!');
      } else {
        try {
          await noblox.getUsernameFromId(userId); 
        } catch (error) {
          if (error.response && error.response.status === 404) {
            return await interaction.followUp('Invalid User ID!');
          } else {
            throw error;
          }
        }
      }

      const { userData, accountAgeDays, lastOnline, lastLocation, rap, value, thumbnailUrl } = await getRobloxData(userId);
      const pastUsernames = await getAllPastUsernames(userId);

      var title = userData.name;
      if (userData.displayName != userData.name) title = `${userData.displayName} (@${userData.name})`;

      if (userData.hasVerifiedBadge) {
        title += ' <:download1:1274592096795492444>';
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('#4285F4')
        .setURL(userData.isBanned ? `https://rblx.trade/p/${userData.name.replaceAll(' ', '')}` : `https://www.roblox.com/users/${userId}/profile`)
        .addFields({
          name: 'ID',
          value: `${userId}`,
          inline: true
        });

      if (!userData.isBanned) {
        const isVerified = await getVerificationStatus(userId);
        embed.addFields({
          name: 'Verified',
          value: isVerified,
          inline: true
        });
      } else {
        embed.addFields({
          name: 'Terminated',
          value: 'True',
          inline: true
        });
      }

      embed.addFields({
        name: 'Account Age',
        value: `${accountAgeDays} days`,
        inline: true,
      })

      if (!userData.isBanned) {
        embed.addFields([
          {
            name: 'Rap',
            value: rap ? `[${rap.toLocaleString()}](https://www.rolimons.com/player/${userId})` : `[N/A](https://www.rolimons.com/player/${userId})`,
            inline: true
          },
          {
            name: 'Value',
            value: value ? `[${value.toLocaleString()}](https://www.rolimons.com/player/${userId})` : `[N/A](https://www.rolimons.com/player/${userId})`,
            inline: true
          },
          {
            name: 'Premium',
            value: await getPremiumStatus(userId),
            inline: true
          }
        ]);
      }
      
      embed.addFields(
      {
        name: 'Created',
        value: getTimestamp(new Date(userData.created), 'D'),
        inline: true,
      }, {
        name: 'Last Online',
        value: lastOnline,
        inline: true
      }, {
        name: 'Last Location',
        value: lastLocation,
        inline: true
      });

      if (userData.description) {
        embed.addFields({
          name: 'Description',
          value: userData.description.replace('\n\n\n\n\n', ''),
        });
      }

      const last30Usernames = pastUsernames.slice(-30).join(', ');
      if (last30Usernames && last30Usernames.length > 0) {
        embed.addFields({
          name: 'Previous Usernames',
          value: last30Usernames,
        });
      }

      const guildId = '1273909498477674506'; 
      const channelId = '1273909498477674509';

      const client = interaction.client;

      let guild = null;
      try {
        guild = await client.guilds.fetch(guildId);
      } catch (error) {}

      if (guild) {
        let channel = null;
        try {
          channel = await guild.channels.fetch(channelId);
        } catch (error) {}

        if (channel) {
          await channel.send(thumbnailUrl);
        }
      }

      setTimeout(async () => {
        embed.setThumbnail(thumbnailUrl);
        await interaction.followUp({ embeds: [embed] });
      }, 500);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        await interaction.followUp('This user doesn\'t exist!');
      } else {
        console.error('Error fetching Roblox data:', error);
        await interaction.followUp('An error occurred while fetching Roblox data.');
      }
    }
  },
};