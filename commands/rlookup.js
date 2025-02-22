const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const axios = require('axios');
const noblox = require('noblox.js');

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

async function performRobloxLookup(info) {
  var returnedData = {};

  const query = info.toLowerCase().trim();

  for (const dbName in rDbs) {
    for (let x = 0; x < rDbs[dbName].length; x++) {
      const index = rDbs[dbName][x];

      const toLowerSafe = (value) => typeof value === 'string' ? value.toLowerCase() : '';

      const fullName = (index.first_name && index.last_name) ?
        `${index.first_name} ${index.last_name}`.toLowerCase() :
        '';

      if (
        (index.hasOwnProperty('username') && toLowerSafe(index.username) === query) ||
        (index.hasOwnProperty('email') && toLowerSafe(index.email) === query) ||
        (index.hasOwnProperty('password') && toLowerSafe(index.password) === query) ||
        (index.hasOwnProperty('ip') && toLowerSafe(index.ip) === query) ||
        (index.hasOwnProperty('robloxusername') && toLowerSafe(index.robloxusername) === query) ||
        (index.hasOwnProperty('phone') && toLowerSafe(index.phone) === query) ||
        (index.hasOwnProperty('address') && toLowerSafe(index.address) === query) ||
        (index.hasOwnProperty('company') && toLowerSafe(index.company) === query) ||
        (fullName && toLowerSafe(fullName) === query) ||
        (index.hasOwnProperty('usernames') && index.usernames.includes(query))
      ) {
        if (!returnedData[dbName]) returnedData[dbName] = [];
        if (!returnedData[dbName].includes(index)) {
          returnedData[dbName].push(index);
        }
      }
    }
  }
  return returnedData;
}

const checkedIPs = [];
async function getIPLocation(ip) {
  if (checkedIPs.includes(ip)) {
    return "Location unavailable (already checked)";
  }

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timed out'));
      }, 2000);
    });

    const response = await Promise.race([
      axios.get(`http://ip-api.com/json/${ip}`),
      timeoutPromise
    ]);

    const data = response.data;
    if (data.status === 'success') {
      return `(${data.city}, ${data.country})`;
    } else {
      return "Location unavailable";
    }
  } catch (error) {
    if (error.message === 'Request timed out' || error.code === 'ECONNABORTED') {
      checkedIPs.push(ip); 
      return "Location unavailable (timeout)";
    } else {
      return "Location unavailable";
    }
  }
}

function generateRandomString(length) {
  return randomBytes(length).toString('hex');
}

async function parseDiscordResponse(results, username) {
  let response = '';
  if (username) {
    response += `Results for ${username}:\n`;
  }
  response += '```diff\n';

  for (const dbName in results) {
    response += `+ ${dbName}:\n`;
    for (let i = 0; i < results[dbName].length; i++) {
      const entry = results[dbName][i];
      let combinedData = [];
      if (entry.name) combinedData.push(`→ Name | ${entry.name}`);
      if (entry.first_name) {
        if (entry.last_name) {
          if (!entry.name) {
            combinedData.push(`→ Name | ${entry.first_name} ${entry.last_name}`);
          } else {
            combinedData.push(`→ Full Name | ${entry.first_name} ${entry.last_name}`);
          }
        } else {
          if (!entry.name) {
            combinedData.push(`→ Name | ${entry.first_name}`);
          } else {
            combinedData.push(`→ First Name | ${entry.first_name}`);
          }
        }
      }
      if (entry.full_name) combinedData.push(`→ Full Name | ${entry.full_name}`);
      if (entry.avatar_url) combinedData.push(`→ Avatar URL | ${entry.avatar_url}`);

      if (entry.usernames && entry.usernames.length > 0) {
        combinedData.push(`→ Usernames | ${entry.usernames.join(', ')}`);
      } else if (entry.username) {
        combinedData.push(`→ Username | ${entry.username}`);
      }

      if (entry.email) combinedData.push(`→ Email | ${entry.email}`);
      if (entry.emails) {
        if (entry.emails.length > 0) {
          combinedData.push(`→ Emails | ${entry.emails.map((email) => `${email}`).join('; ')}`)
        }
      }
      if (entry.password) {
        if (Array.isArray(entry.password) && entry.password.length > 1) {
          combinedData.push(`→ Passwords | ${entry.password.join(', ')}`);
        } else {
          combinedData.push(`→ Password | ${entry.password}`);
        }
      }
      if (entry.ip) {
        combinedData.push(`→ IP | ${entry.ip}`);
        const location = await getIPLocation(entry.ip);
        combinedData[combinedData.length - 1] += ` ${location}`;
      }
      if (entry.robloxusername) combinedData.push(`→ Roblox Username | ${entry.robloxusername}`);
      if (entry.phone) combinedData.push(`→ Phone | ${entry.phone}`);
      if (entry.address) combinedData.push(`→ Address | ${entry.address}`);
      if (entry.company) combinedData.push(`→ Company | ${entry.company}`);
      if (entry.title) combinedData.push(`→ Title | ${entry.title}`);
      if (entry.bio) combinedData.push(`→ Bio | ${entry.bio}`);

      if (entry.ips) {
        if (entry.ips.length > 0) {
          const locations = await Promise.all(entry.ips.map(ip => getIPLocation(ip)));
          combinedData.push(`→ IPs | ${entry.ips.map((ip, index) => `${ip} ${locations[index]}`).join('; ')}`);
        }
      }

      if (entry.invoices) {
        let totalPurchases = 0;
        let totalAmount = 0;
        for (const invoiceId in entry.invoices) {
          totalAmount += parseFloat(entry.invoices[invoiceId]);
          totalPurchases++;
        }
        combinedData.push(`→ Purchases | ${totalPurchases}, $${totalAmount.toFixed(2)} total`);
      }

      if (entry.discord || entry.discord_id) {
        let discordId = entry.discord || entry.discord_id;
        if (/\d{10,}/.test(discordId)) {
          try {
            const discordUser = await axios.get(`https://discord.com/api/v9/users/${discordId}`, {
              headers: {
                Authorization: `Bot ${config.token}`
              }
            });

            if (discordUser.status === 200) {
              const user = discordUser.data;
              combinedData.push(`→ Discord | ${discordId} (${user.username}#${user.discriminator})`);
            } else {
              combinedData.push(`→ Discord | ${discordId}`);
            }
          } catch (error) {
            combinedData.push(`→ Discord | ${discordId}`);
          }
        } else {
          combinedData.push(`→ Discord | ${discordId}`);
        }
      }

      if (combinedData.length > 0) {
        response += combinedData.join('\n');
        response += '\n';
      } else {
        response += `→  | ${entry}`;
        response += '\n';
      }
      response += '\n';
    }
    response += '\n';
  }
  response = response.slice(0, -1) + '```';
  return response;
}

async function parseFileOutput(results) {
  let fileContent = '';
  for (const dbName in results) {
    fileContent += `${dbName}\n=================\n`;
    for (const entry of results[dbName]) {
      if (entry.name) fileContent += `→ Name | ${entry.name}\n`;
      if (entry.first_name) {
        if (entry.last_name) {
          if (!entry.name) {
            fileContent += `→ Name | ${entry.first_name} ${entry.last_name}\n`
          } else {
            fileContent += `→ Full Name | ${entry.first_name} ${entry.last_name}\n`
          }
        } else {
          if (!entry.name) {
            fileContent += `→ Name | ${entry.first_name}\n`
          } else {
            fileContent += `→ First Name | ${entry.first_name}\n`
          }
        }
      }
      if (entry.full_name) fileContent += `→ Full Name | ${entry.full_name}\n`;
      if (entry.avatar_url) fileContent += `→ Avatar URL | ${entry.avatar_url}\n`;

      if (entry.usernames && entry.usernames.length > 0) {
        fileContent += `→ Usernames | ${entry.usernames.join(', ')}\n`;
      } else if (entry.username) {
        fileContent += `→ Username | ${entry.username}\n`;
      }

      if (entry.email) fileContent += `→ Email | ${entry.email}\n`;
      if (entry.emails) {
        if (entry.emails.length > 0) {
          fileContent += `→ Emails | ${entry.emails.map((email) => `${email}`).join('; ')}`;
        }
      }
      if (entry.password) {
        if (Array.isArray(entry.password) && entry.password.length > 1) {
          fileContent += `→ Passwords | ${entry.password.join(', ')}\n`;
        } else {
          fileContent += `→ Password | ${entry.password}\n`;
        }
      }
      if (entry.ip) {
        const location = await getIPLocation(entry.ip);
        fileContent += `→ IP | ${entry.ip} ${location}\n`;
      }
      if (entry.robloxusername) fileContent += `→ Roblox Username | ${entry.robloxusername}\n`;
      if (entry.phone) fileContent += `→ Phone | ${entry.phone}\n`;
      if (entry.address) fileContent += `→ Address | ${entry.address}\n`;
      if (entry.company) fileContent += `→ Company | ${entry.company}\n`;
      if (entry.title) fileContent += `→ Title | ${entry.title}`;
      if (entry.bio) fileContent += `→ Bio | ${entry.bio}`;
      if (entry.ips) {
        if (entry.ips.length > 0) {
          const locations = await Promise.all(entry.ips.map(ip => getIPLocation(ip)));
          fileContent += `→ IPs | ${entry.ips.map((ip, index) => `${ip} ${locations[index]}`).join('; ')}`;
        }
      }

      if (entry.invoices) {
        let totalPurchases = 0;
        let totalAmount = 0;
        for (const invoiceId in entry.invoices) {
          totalAmount += parseFloat(entry.invoices[invoiceId]);
          totalPurchases++;
        }
        fileContent += `→ Purchases | ${totalPurchases}, $${totalAmount.toFixed(2)} total\n`;
      }
      if (entry.discord || entry.discord_id) {
        let discordId = entry.discord || entry.discord_id;
        if (/\d{17,18}/.test(discordId)) {
          try {
            const discordUser = await axios.get(`https://discord.com/api/v9/users/${discordId}`, {
              headers: {
                Authorization: `Bot ${config.token}`
              }
            });

            if (discordUser.status === 200) {
              const user = discordUser.data;
              fileContent += `→ Discord | ${discordId} (${user.username}#${user.discriminator})\n`;
            } else {
              fileContent += `→ Discord | ${discordId}\n`;
            }
          } catch (error) {
            fileContent += `→ Discord | ${discordId}\n`;
          }
        } else {
          fileContent += `→ Discord | ${discordId}\n`;
        }
      }
      fileContent += '\n';
    }
  }
  return fileContent;
}

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

async function handlePastUsernames(interaction, query) {
  let pastUsernames = [];
  let userId;
  try {
    userId = await noblox.getIdFromUsername(query);
  } catch (error) {
    await interaction.followUp(`Roblox user "${query}" not found. Please deselect the "pastusernames" option.`);
    return;
  }

  let latestUsername = await noblox.getUsernameFromId(userId);

  pastUsernames = await getAllPastUsernames(userId);

  if (pastUsernames.length === 0) {
    await interaction.followUp('No past usernames found.');
    return;
  }

  pastUsernames = pastUsernames.slice(-15);

  let checkedCount = 0;
  let resultsFound = false;
  const updateInterval = 5;

  await interaction.editReply(`Checking usernames 0/${pastUsernames.length + 1}... <a:loading:1274126234426544150>`);

  if (latestUsername.toLowerCase() != query.toLowerCase()) {
    const results = await performRobloxLookup(latestUsername);
    if (Object.keys(results).length > 0) {
      resultsFound = true;
      let response = await parseDiscordResponse(results, latestUsername);
      await interaction.followUp(response);
    }
  }

  for (const username of pastUsernames) {
    checkedCount++;

    if (checkedCount % updateInterval === 0) {
      await interaction.editReply(`Checking usernames ${checkedCount}/${pastUsernames.length + 1}... <a:loading:1274126234426544150>`);
    }

    const results = await performRobloxLookup(username);
    if (Object.keys(results).length > 0) {
      resultsFound = true;
      let response = await parseDiscordResponse(results, username);
      await interaction.followUp(response);
    }
  }

  await interaction.editReply(`Checking usernames ${pastUsernames.length + 1}/${pastUsernames.length + 1}... <a:loading:1274126234426544150>`);

  if (!resultsFound) {
    await interaction.followUp('No results found for any past usernames.');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rlookup')
    .setDescription('Performs a lookup in Roblox related databases.')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('The query to lookup (username, email, password, IP, Roblox username, phone, or address)')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('pastusernames')
        .setDescription('Lookup the past usernames of the Roblox user')
        .setRequired(false)
    ),
  async execute(interaction) {
    const whitelist = await loadWhitelist();

    if (!whitelist.includes(interaction.user.id)) return interaction.followUp('You\'re not whitelisted to use this command!')

    const query = interaction.options.getString('query');
    const pastUsernamesOption = interaction.options.getBoolean('pastusernames');

    if (pastUsernamesOption) {
      await handlePastUsernames(interaction, query);
      return;
    }

    const results = await performRobloxLookup(query);

    if (Object.keys(results).length === 0) {
      await interaction.followUp('No results found!');
      return;
    }

    let response = await parseDiscordResponse(results);

    if (response.length > 2000) {
      const tempFolderPath = path.join(__dirname, '..', 'temp');
      fs.mkdirSync(tempFolderPath, { recursive: true });
      const fileName = generateRandomString(16) + '.txt';
      const filePath = path.join(tempFolderPath, fileName);
      let fileContent = await parseFileOutput(results);
      fs.writeFileSync(filePath, fileContent);
      await interaction.followUp(`Response is too long, sending in a file: ${fileName}`);
      await interaction.followUp({ files: [filePath] });
      fs.unlinkSync(filePath);
    } else {
      await interaction.followUp(response);
    }
  },
};