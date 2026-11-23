import {
  Message,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { AppConfig } from '../config';
import { StorageService } from '../services/storage';
import { buildPrConfirmationCard } from './modal-handler';

export function buildDmDashboardEmbed(userUsername: string, config: AppConfig) {
  const embed = new EmbedBuilder()
    .setTitle(`🤖 GitHub PR Bot — Direct Message Dashboard`)
    .setDescription(
      `Hello **${userUsername}**! You can manage your working branches and create Pull Requests directly here without being in a server.\n\n` +
      `**Quick Actions:** Use the buttons below, or run slash commands like \`/pr\`, \`/set-branch\`, and \`/my-branches\` right in this chat.`
    )
    .setColor(0x5865f2)
    .setTimestamp();

  if (config.repositories.length === 0) {
    embed.addFields({
      name: '⚠️ Repositories',
      value: 'No repositories configured in `.env` yet.',
    });
  } else {
    const repoList = config.repositories
      .map(r => `• **${r.fullName}** *(Target: \`${r.targetBranch}\`)*`)
      .join('\n');
    embed.addFields({
      name: `📁 Configured Repositories (${config.repositories.length})`,
      value: repoList,
    });
  }

  return embed;
}

export function buildDmDashboardButtons() {
  const createPrBtn = new ButtonBuilder()
    .setCustomId('dm_btn_create_pr')
    .setLabel('Create PR')
    .setEmoji('🚀')
    .setStyle(ButtonStyle.Success);

  const setBranchBtn = new ButtonBuilder()
    .setCustomId('dm_btn_set_branch')
    .setLabel('Set Branch')
    .setEmoji('🌿')
    .setStyle(ButtonStyle.Primary);

  const myBranchesBtn = new ButtonBuilder()
    .setCustomId('dm_btn_my_branches')
    .setLabel('My Branches')
    .setEmoji('📋')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createPrBtn,
    setBranchBtn,
    myBranchesBtn
  );
}

export function buildMyBranchesEmbed(
  userId: string,
  config: AppConfig,
  storage: StorageService
) {
  const userBranches = storage.getAllUserBranches(userId);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Your Working Branches`)
    .setColor(0x5865f2)
    .setTimestamp();

  if (config.repositories.length === 0) {
    embed.setDescription('⚠️ No repositories are currently configured in `.env`.');
    return embed;
  }

  const fields = config.repositories.map(repo => {
    const savedBranch = userBranches[repo.fullName];
    return {
      name: repo.fullName,
      value: savedBranch
        ? `🟢 From: \`${savedBranch}\` ➔ To: \`${repo.targetBranch}\``
        : `⚪ *Not set* (Target: \`${repo.targetBranch}\`)\nClick **Set Branch** to configure`,
      inline: false,
    };
  });

  embed.addFields(fields);
  return embed;
}

export function buildRepoSelectMenuForPr(config: AppConfig) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('dm_select_repo_pr')
    .setPlaceholder('Select a repository to create a PR')
    .addOptions(
      config.repositories.slice(0, 25).map(r => ({
        label: r.fullName,
        description: `Target branch: ${r.targetBranch}`,
        value: r.fullName,
        emoji: '📁',
      }))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export function buildRepoSelectMenuForSetBranch(config: AppConfig) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('dm_select_repo_set_branch')
    .setPlaceholder('Select a repository to configure your branch')
    .addOptions(
      config.repositories.slice(0, 25).map(r => ({
        label: r.fullName,
        description: `Target branch: ${r.targetBranch}`,
        value: r.fullName,
        emoji: '🌿',
      }))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export async function handleDirectMessage(
  message: Message,
  config: AppConfig,
  storage: StorageService
) {
  if (message.author.bot) return;
  // Only trigger on direct messages
  if (!message.channel.isDMBased()) return;

  const content = message.content.trim().toLowerCase();

  // 1. Menu / Start / Help
  if (['menu', 'start', 'help', '/menu', '/start', '/help'].includes(content)) {
    const embed = buildDmDashboardEmbed(message.author.username, config);
    const actionRow = buildDmDashboardButtons();
    await message.reply({ embeds: [embed], components: [actionRow] });
    return;
  }

  // 2. PR Command as text: "/pr", "pr", "/create-pr"
  if (['/pr', 'pr', '/create-pr', 'create-pr'].includes(content)) {
    if (config.repositories.length === 0) {
      await message.reply('⚠️ No repositories configured in `.env`.');
      return;
    }
    const row = buildRepoSelectMenuForPr(config);
    await message.reply({
      content: '📌 **Choose the repository for your Pull Request:**',
      components: [row],
    });
    return;
  }

  // 3. Set Branch Command as text: "/set-branch", "set-branch", "/branch"
  if (['/set-branch', 'set-branch', '/branch', 'branch', '/setbranch', 'setbranch'].includes(content)) {
    if (config.repositories.length === 0) {
      await message.reply('⚠️ No repositories configured in `.env`.');
      return;
    }
    const row = buildRepoSelectMenuForSetBranch(config);
    await message.reply({
      content: '📌 **Choose the repository you want to set your branch for:**',
      components: [row],
    });
    return;
  }

  // 4. My Branches Command as text: "/my-branches", "my-branches", "branches"
  if (['/my-branches', 'my-branches', '/branches', 'branches', '/mybranches', 'mybranches'].includes(content)) {
    const embed = buildMyBranchesEmbed(message.author.id, config, storage);
    await message.reply({ embeds: [embed] });
    return;
  }

  // 5. Any other text -> Helpful guidance
  const embed = buildDmDashboardEmbed(message.author.username, config);
  const actionRow = buildDmDashboardButtons();
  await message.reply({
    content: `💡 Tip: Click the **Create PR** button below, or type **pr**, **set-branch**, or **my-branches**.`,
    embeds: [embed],
    components: [actionRow],
  });
}

export async function handleDmButton(
  interaction: ButtonInteraction,
  config: AppConfig,
  storage: StorageService
) {
  const { customId, user } = interaction;

  // 1. My Branches Button
  if (customId === 'dm_btn_my_branches') {
    const embed = buildMyBranchesEmbed(user.id, config, storage);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // 2. Create PR Button -> Show Repo Select Menu
  if (customId === 'dm_btn_create_pr') {
    if (config.repositories.length === 0) {
      await interaction.reply({
        content: '⚠️ No repositories configured in `.env`.',
        ephemeral: true,
      });
      return;
    }

    const row = buildRepoSelectMenuForPr(config);
    await interaction.reply({
      content: '📌 **Choose the repository for your Pull Request:**',
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // 3. Set Branch Button -> Show Repo Select Menu
  if (customId === 'dm_btn_set_branch') {
    if (config.repositories.length === 0) {
      await interaction.reply({
        content: '⚠️ No repositories configured in `.env`.',
        ephemeral: true,
      });
      return;
    }

    const row = buildRepoSelectMenuForSetBranch(config);
    await interaction.reply({
      content: '📌 **Choose the repository you want to set your branch for:**',
      components: [row],
      ephemeral: true,
    });
    return;
  }
}

export async function handleDmSelectMenu(
  interaction: StringSelectMenuInteraction,
  config: AppConfig,
  storage: StorageService
) {
  const { customId, values, user } = interaction;
  const repoFullName = values[0];

  const repoConfig = config.repositories.find(
    r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
  );

  if (!repoConfig) {
    await interaction.reply({
      content: `❌ Repository **${repoFullName}** not found.`,
      ephemeral: true,
    });
    return;
  }

  // A. Selected Repo for Creating PR
  if (customId === 'dm_select_repo_pr') {
    const userFromBranch = storage.getUserBranch(user.id, repoConfig.fullName);

    if (!userFromBranch) {
      await interaction.update({
        content: `⚠️ You haven't set your working branch for **${repoConfig.fullName}** yet.\nClick **Set Branch** or use \`/set-branch\` first!`,
        components: [],
      });
      return;
    }

    const card = buildPrConfirmationCard(repoConfig, userFromBranch, config.notifierIds.length);

    await interaction.update({
      content: '',
      embeds: [card.embed],
      components: card.components,
    });
    return;
  }

  // B. Selected Repo for Setting Branch -> Open Modal to input branch name
  if (customId === 'dm_select_repo_set_branch') {
    const currentBranch = storage.getUserBranch(user.id, repoConfig.fullName) || '';

    const modal = new ModalBuilder()
      .setCustomId(`dm_modal_set_branch:${repoConfig.fullName}`)
      .setTitle(`Set Branch: ${repoConfig.repo}`);

    const branchInput = new TextInputBuilder()
      .setCustomId('branch_name_input')
      .setLabel('Your Working (From) Branch Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. feature/my-feature or branch-01')
      .setValue(currentBranch)
      .setRequired(true)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(branchInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }
}

export async function handleDmModalSubmit(
  interaction: ModalSubmitInteraction,
  config: AppConfig,
  storage: StorageService
) {
  if (!interaction.customId.startsWith('dm_modal_set_branch:')) return;

  const repoFullName = interaction.customId.replace('dm_modal_set_branch:', '');
  const repoConfig = config.repositories.find(
    r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
  );

  if (!repoConfig) {
    await interaction.reply({
      content: `❌ Could not find repository configuration for **${repoFullName}**.`,
      ephemeral: true,
    });
    return;
  }

  const branch = interaction.fields.getTextInputValue('branch_name_input').trim();
  storage.setUserBranch(interaction.user.id, repoConfig.fullName, branch);

  await interaction.reply({
    content: `✅ Saved your working branch for **${repoConfig.fullName}** as \`${branch}\`!\nTarget branch is \`${repoConfig.targetBranch}\`.\nYou can now click **Create PR** or use \`/pr\` anytime!`,
    ephemeral: true,
  });
}
