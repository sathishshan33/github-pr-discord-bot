import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} from 'discord.js';
import { AppConfig } from '../config';
import { StorageService } from '../services/storage';

export const myBranchesCommand = {
  data: new SlashCommandBuilder()
    .setName('my-branches')
    .setDescription('View your saved working branches across configured repositories')
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ])
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ]),

  async execute(
    interaction: ChatInputCommandInteraction,
    config: AppConfig,
    storage: StorageService
  ) {
    const userBranches = storage.getAllUserBranches(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle(`Working Branches for ${interaction.user.username}`)
      .setColor(0x5865f2)
      .setTimestamp();

    if (config.repositories.length === 0) {
      embed.setDescription('⚠️ No repositories are currently configured in `.env`.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const fields = config.repositories.map(repo => {
      const savedBranch = userBranches[repo.fullName];
      return {
        name: repo.fullName,
        value: savedBranch
          ? `🟢 From: \`${savedBranch}\` ➔ To: \`${repo.targetBranch}\``
          : `⚪ *Not set* (Target: \`${repo.targetBranch}\`)\nUse \`/set-branch repo:${repo.fullName} branch:<name>\``,
        inline: false,
      };
    });

    embed.addFields(fields);
    embed.setFooter({ text: 'Use /set-branch to update your branch for any repository' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
