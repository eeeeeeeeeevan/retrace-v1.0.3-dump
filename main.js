const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    console.log(`Command ${command.data.name} loaded successfully:`, command); 
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

global.rDbs = {};

async function loadDatabases() {
  const customdbs = path.join(__dirname, 'customdbs');
  const files = await fs.promises.readdir(customdbs);
  var counter = 0;

  for (const file of files) {
    const filePath = path.join(customdbs, file);
    console.log(`Loading ${file}...`);
    try {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      rDbs[file] = fileData;
      counter += fileData.length;
      console.log(`Loaded ${file}! Count: ${counter}`);
    } catch (error) {
      console.error(`Error loading ${file}:`, error);
    }
  }
  console.log("All databases loaded.");
}

client.on(Events.ClientReady, async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  await loadDatabases();

  try {
    console.log('Started refreshing application (/) commands.');

    const rest = new REST({ version: '10' }).setToken(config.token);
    const clientId = config.clientId;
    console.log(`Client ID: ${clientId}`);

    const commands = [];
    for (const command of client.commands.values()) {
      commands.push(command.data.toJSON());
    } 
    for (let i = 0; i < commands.length; i++) {
      commands[i].integration_types = [0, 1];
      commands[i].contexts = [0, 1, 2];
    }
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    // console.log(commands)

    console.log('reloaded application commands.');
    console.log('debug one')
  } catch (error) {
    console.error(error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await interaction.deferReply();
  } catch {return}

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command found for ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    await interaction.followUp({ content: 'There was an error while executing this command!' });
  }
});

client.login(config.token);
