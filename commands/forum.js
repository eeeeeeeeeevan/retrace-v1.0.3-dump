const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forum')
    .setDescription('Searches a Roblox username through the Forum Archive.')
    .addStringOption(option => 
      option.setName('username')
        .setDescription('The Roblox username to search for.')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('order')
        .setDescription('Order of posts to display')
        .setRequired(false)
        .addChoices(
          { name: 'Latest->Oldest', value: 'latest->oldest' },
          { name: 'Oldest->Latest', value: 'oldest->latest' },
        )
    ),
  async execute(interaction) {
    const username = interaction.options.getString('username');
    const order = interaction.options.getString('order') || 'latest->oldest';

    try {
      const userId = await noblox.getIdFromUsername(username);

      const fetchPosts = async (lastId = null) => {
        let apiUrl = `https://api.froast.io/users/${userId}/posts?order=${order === 'oldest->latest' ? 'asc' : 'desc'}`;
        if (lastId) {
          apiUrl += `&last=${lastId}`; 
        }
        try {
          const response = await axios.get(apiUrl);
          if (response.status === 403 && response.data.errCode === "UserHidden") {
            throw new Error("UserHidden");
          }
          return response.data;
        } catch (error) {
          console.error('Error fetching posts:', error);
          if (error.message === "UserHidden") {
            throw new Error("UserHidden");
          } else {
            throw new Error("This user does not have any posts.");
          }
        }
      };

      let data = await fetchPosts();
      const posts = data.results;
      const user = data.user;

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

      const createEmbed = (start, end) => {
        const embed = new EmbedBuilder()
          .setTitle(user.username)
          .setColor('#4285F4')
          .setURL(`https://roblox.com/users/${userId}/profile`)
          .setDescription('Forum Posts')
          .setThumbnail(thumbnailUrl);

        for (let i = start; i < end && i < posts.length; i++) {
          const post = posts[i];
          embed.addFields([
            { name: `${post.parent.subject}`, value: post.body },
            { name: 'Date:', value: new Date(post.date).toLocaleDateString(), inline: true },
            { name: 'Thread?', value: post.isThread ? 'Yes' : 'No', inline: true }
          ]);
        }

        return embed;
      };

      let currentPage = 1;
      let lastPostId = null;
      const embed = createEmbed(0, 3);

      if (posts.length < 3) {
        await interaction.followUp({ embeds: [embed] }); 
        return;
      }

      let fetchingMorePosts = false;

      const prevButton = new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);

      let nextButton = new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder()
        .addComponents(prevButton, nextButton);

      let message = await interaction.followUp({ embeds: [embed], components: [row] }); 

      const filter = i => i.user.id === interaction.user.id && ['prev', 'next'].includes(i.customId);
      const collector = message.createMessageComponentCollector({ filter }); 

      collector.on('collect', async i => {
        if (i.customId === 'prev' && currentPage > 1) {
          currentPage--;
          prevButton.setDisabled(currentPage === 1);
          nextButton.setDisabled(false);
          embed.data.fields = []; 
          embed.addFields(createEmbed((currentPage - 1) * 3, currentPage * 3).data.fields); 
          try {await i.update({ embeds: [embed], components: [row] });} catch {}
        } else if (i.customId === 'next' && currentPage * 3 < posts.length) {
          currentPage++;
          prevButton.setDisabled(false);
          nextButton.setDisabled(currentPage * 3 >= posts.length); 
          embed.data.fields = []; 
          embed.addFields(createEmbed((currentPage - 1) * 3, currentPage * 3).data.fields); 
          try {await i.update({ embeds: [embed], components: [row] });} catch {}
        } else if (i.customId === 'next' && currentPage * 3 >= posts.length) {
          if (fetchingMorePosts) {
            return;
          }

          fetchingMorePosts = true;
          try {
            data = await fetchPosts(lastPostId);
            posts.push(...data.results); 
            lastPostId = data.results[data.results.length - 1].id;

            currentPage++;
            prevButton.setDisabled(false);
            nextButton.setDisabled(currentPage * 3 >= posts.length); 
            embed.data.fields = []; 
            embed.addFields(createEmbed((currentPage - 1) * 3, currentPage * 3).data.fields); 
            try {await i.update({ embeds: [embed], components: [row] });} catch {}
          } catch (error) {
            console.error('Error fetching more posts:', error);
          } finally {
            fetchingMorePosts = false; 
          }
        }
      });

      collector.on('end', () => {
        prevButton.setDisabled(true);
        nextButton.setDisabled(true);
        try {
          message.channel.fetch()
            .then(channel => {
              channel.edit({ components: [row] });
            })
            .catch(error => {
              console.error('Error fetching channel:', error);
            });
        } catch {}
      });

    } catch (error) {
      console.error(error);
      await interaction.followUp(`This user most likely does not have any posts or hid them.`);
    }
  },
};