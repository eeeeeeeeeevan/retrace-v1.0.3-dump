const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const axios = require('axios');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const userCooldowns = new Set();
const resultCache = new Map();

async function loadWhitelist() {
  try {
    const whitelistData = fs.readFileSync('./whitelist.json', 'utf-8');
    return JSON.parse(whitelistData);
  } catch (err) {
    console.error("Error loading whitelist:", err);
    return [];
  }
}

async function lookupData(query, apiEndpoint) {
  try {
    const data = {};
    if (apiEndpoint.includes('usernamesearch') || apiEndpoint.includes('usersearch')) {
      data.username = query;
    } else {
      data.email = query;
    }

    const response = await axios.post(
      apiEndpoint,
      data,
      {
        headers: {
          'Cookie': `API-Key=${config.osintCatApiKey}`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Accept': '*/*'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Error looking up data from ${apiEndpoint}:`, error);
    return null;
  }
}

function formatResults(results, forFile = false) {
  let formatted = '';

  if (!forFile) {
    formatted += '```diff\n';
  }

  for (const breachName in results) {
    formatted += `+ ${breachName.replace(/_/g, ' ')}:\n`;
    for (const entry of results[breachName]) {
      for (const field in entry) {
        const formattedField = field.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
        formatted += `→ ${formattedField} | ${entry[field]}\n`;
      }
      formatted += '\n';
    }
    formatted += '\n';
  }

  if (!forFile) {
    formatted += '```';
  }
  return formatted;
}

function ragdollformat(results, forFile = false) {
  let formatted = '';

  if (!forFile) {
    formatted += '```diff\n';
  }

  for (const result of results) {
    formatted += `+ ${result.sources.join(', ') || "Unknown Source"}\n`;

    for (const key in result) {
      if (key === 'email_only' || key === 'sources') continue;

      const formattedKey = key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

      if (formattedKey === 'Last breach' && result[key] === null) {
        formatted += `→ ${formattedKey}: Unknown\n`; 
      } else {
        formatted += `→ ${formattedKey}: ${Array.isArray(result[key]) ? result[key].join(', ') : result[key]}\n`;
      }
    }
    if (result !== results[results.length - 1]) {
      formatted += '\n';
    }
  }

  if (!forFile) {
    formatted += '```';
  }
  return formatted;
}

function formatBurmeseResults(results, forFile = false) {
  let formatted = '';

  if (!forFile) {
    formatted += '```diff\n';
  }

  for (const result of results) {
    formatted += `+ ${result.origin || "Unknown Source"}\n`;

    for (const key in result) {
      if (key === 'origin' || result[key] === 'NULL' || result[key] === '' || result[key] === null || result[key] === undefined) {
        continue;
      }
      const formattedKey = key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      formatted += `→ ${formattedKey}: ${Array.isArray(result[key]) ? result[key].join(', ') : result[key]}\n`;
    }
    formatted += '\n';
  }

  if (!forFile) {
    formatted += '```';
  }
  return formatted;
}

function generateRandomString(length) {
  return randomBytes(length).toString('hex');
}

async function sendResultsAsFile(interaction, results, formatFunction) {
  const tempFolderPath = path.join(__dirname, '..', 'temp');
  fs.mkdirSync(tempFolderPath, { recursive: true });
  const fileName = generateRandomString(16) + '.diff';
  const filePath = path.join(tempFolderPath, fileName);

  let fileContent = formatFunction(results, true);

  fs.writeFileSync(filePath, fileContent);
  return await interaction.followUp({
    files: [{
      attachment: filePath,
      name: fileName,
      description: 'Lookup Results'
    }]
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Looks up a query in database breaches.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('The query (username or email)')
        .setRequired(true)
    ),
  async execute(interaction) {
    const whitelist = await loadWhitelist();

    if (!whitelist.includes(interaction.user.id)) {
      return interaction.followUp('You\'re not whitelisted to use this command!');
    }

    const userId = interaction.user.id;

    if (userCooldowns.has(userId)) {
      return interaction.reply('You need to wait 5 seconds before using this command again.');
    }

    const query = interaction.options.getString('query');

    const cachedResult = resultCache.get(query);
    if (cachedResult) {
      console.log('Serving from cache!');
      await interaction.reply(cachedResult.message);
      if (cachedResult.isFile) {
        await interaction.followUp({ files: cachedResult.fileData });
      }
      return;
    }

    let apiEndpoints = [];
    let isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);

    if (isEmail) {
      apiEndpoints = [
        'https://osintcat.com/api/mainecoonemailsearch',
        'https://osintcat.com/api/ragdollemailsearch',
        'https://osintcat.com/api/burmeseemailsearch'
      ];
    } else {
      apiEndpoints = [
        'https://osintcat.com/api/mainecoonusersearch',
        'https://osintcat.com/api/ragdollusernamesearch',
        'https://osintcat.com/api/burmeseusernamesearch'
      ];
    }

    let fileData = [null, null, null];
    let formattedResultsArray = ['', '', ''];
    let anyResultsFound = false;

    for (let i = 0; i < apiEndpoints.length; i++) {
      const apiEndpoint = apiEndpoints[i];
      const results = await lookupData(query, apiEndpoint);

      let formattedResults = '';
      const index = i;

      if (index === 0 && results && results.results && Object.keys(results.results).length > 0) {
        formattedResults = formatResults(results.results);
      } else if (index === 1 && results && results.result && results.result.length > 0) {
        formattedResults = ragdollformat(results.result);
      } else if (index === 2 && results && results.content && results.content.length > 0) {
        formattedResults = formatBurmeseResults(results.content);
      }

      formattedResultsArray[index] = formattedResults;

      if (formattedResults.length > 2000) {
        fileData[index] = {
          attachment: '',
          name: '',
          description: `Lookup Results (${apiEndpoint.split('/').pop().replace('emailsearch', '').replace('usersearch', '').replace('usernamesearch', '').toUpperCase()})`
        };

        await sendResultsAsFile(
          interaction,
          index === 0 ? results.results : (index === 1 ? results.result : (index === 2 ? results.content : results.content.content)),
          index === 0 ? formatResults : (index === 1 ? ragdollformat : formatBurmeseResults)
        )
          .then(message => {
            fileData[index].attachment = message.attachments.first().attachment;
            fileData[index].name = message.attachments.first().name;
          });
      } else if (formattedResults !== '') { 
        await interaction.followUp(formattedResults);
        anyResultsFound = true;
      }
    }

    if (!anyResultsFound) {
      return interaction.followUp("No results found!");
    }

    const cacheEntry = {
      message: (formattedResultsArray.some(result => result.length > 2000))
        ? 'Response sent as a file.'
        : formattedResultsArray.join('\n'),
      isFile: formattedResultsArray.some(result => result.length > 2000),
      fileData: fileData.filter(data => data !== null)
    };

    resultCache.set(query, cacheEntry);
    setTimeout(() => resultCache.delete(query), 600000);

    userCooldowns.add(userId);
    setTimeout(() => {
      userCooldowns.delete(userId);
    }, 5000);
  },
};