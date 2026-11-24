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
import { GuildRuntimeConfig, GuildService } from '../services/guild-service';
import { buildPrConfirmationCard } from './modal-handler';
import { buildSetTokenModal } from '../commands/set-token';

export function buildDmDashboardEmbed(userUsername: string, guildConfig: GuildRuntimeConfig) {
  const channelText = guildConfig.channelId ? `<#${guildConfig.channelId}>` : 'this server';

  const embed = new EmbedBuilder()
    .setTitle(`🤖 GitHub PR Bot — Control Panel`)
    .setDescription(
      `Hello **${userUsername}**! You can manage your personal branches, GitHub token, and create Pull Requests directly here.\n\n` +
      `**Quick Actions:** Use the buttons below, or run slash commands like \`/pr\`, \`/set-branch\`, \`/my-branches\`, and \`/set-token\` in ${channelText}.`
    )
    .setColor(0x5865f2)
    .setTimestamp();

  if (guildConfig.repositories.length === 0) {
    embed.addFields({
      name: '⚠️ Repositories',
      value: 'No repositories configured for this server yet. An admin can run `/setup` to add repositories.',
    });
  } else {
    const repoList = guildConfig.repositories
      .map(r => `• **${r.fullName}**`)
      .join('\n');
    embed.addFields({
      name: `📁 Configured Repositories (${guildConfig.repositories.length})`,
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

  const setTokenBtn = new ButtonBuilder()
    .setCustomId('dm_btn_set_token')
    .setLabel('My GitHub Token')
    .setEmoji('🔑')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createPrBtn,
    setBranchBtn,
    myBranchesBtn,
    setTokenBtn
  );
}

export async function buildMyBranchesEmbed(
  guildId: string,
  userId: string,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  const branchConfigs = await guildService.getAllUserBranchConfigs(guildId, userId);
  const userToken = await guildService.getUserToken(userId);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Your Working Branches & GitHub Status`)
    .setColor(0x5865f2)
    .setTimestamp();

  // Show user's GitHub Token status
  let tokenStatus = '❌ *Not connected* (Click **My GitHub Token** to connect)';
  if (userToken) {
    const masked = userToken.length > 8 ? `${userToken.slice(0, 4)}••••${userToken.slice(-4)}` : '••••••••';
    tokenStatus = `✅ Connected (\`${masked}\`) — PRs open with your personal account`;
  }
  embed.addFields({ name: '🔑 Personal GitHub Account Token', value: tokenStatus, inline: false });

  if (guildConfig.repositories.length === 0) {
    embed.setDescription('⚠️ No repositories are currently configured for this server.');
    return embed;
  }

  const fields = guildConfig.repositories.map(repo => {
    const branchConfig = branchConfigs[repo.fullName.toLowerCase()];
    return {
      name: repo.fullName,
      value: branchConfig
        ? `🟢 **branch_name:** \`${branchConfig.branchName}\` ➔ **target_branch:** \`${branchConfig.targetBranch}\``
        : `⚪ *Not set*\nClick **Set Branch** to configure`,
      inline: false,
    };
  });

  embed.addFields(fields);
  return embed;
}

export function buildRepoSelectMenuForPr(guildConfig: GuildRuntimeConfig) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('dm_select_repo_pr')
    .setPlaceholder('Select a repository to create a PR')
    .addOptions(
      guildConfig.repositories.slice(0, 25).map(r => ({
        label: r.fullName,
        description: `Target branch configured in your user settings`,
        value: r.fullName,
        emoji: '📁',
      }))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export function buildRepoSelectMenuForSetBranch(guildConfig: GuildRuntimeConfig) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('dm_select_repo_set_branch')
    .setPlaceholder('Select a repository to configure branch_name & target_branch')
    .addOptions(
      guildConfig.repositories.slice(0, 25).map(r => ({
        label: r.fullName,
        description: `Set your branch_name and target_branch`,
        value: r.fullName,
        emoji: '🌿',
      }))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export async function handleDirectMessage(
  message: Message,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (message.author.bot || !message.guildId) return;

  const content = message.content.trim().toLowerCase();

  // 1. Menu / Start / Help
  if (['menu', 'start', 'help', '/menu', '/start', '/help'].includes(content)) {
    const embed = buildDmDashboardEmbed(message.author.username, guildConfig);
    const actionRow = buildDmDashboardButtons();
    await message.reply({ embeds: [embed], components: [actionRow] });
    return;
  }

  // 2. PR Command as text: "/pr", "pr", "/create-pr"
  if (['/pr', 'pr', '/create-pr', 'create-pr'].includes(content)) {
    if (guildConfig.repositories.length === 0) {
      await message.reply('⚠️ No repositories configured for this server. Run `/setup` to add repositories.');
      return;
    }
    const row = buildRepoSelectMenuForPr(guildConfig);
    await message.reply({
      content: '📌 **Choose the repository for your Pull Request:**',
      components: [row],
    });
    return;
  }

  // 3. Set Branch Command as text: "/set-branch", "set-branch", "/branch"
  if (['/set-branch', 'set-branch', '/branch', 'branch', '/setbranch', 'setbranch'].includes(content)) {
    if (guildConfig.repositories.length === 0) {
      await message.reply('⚠️ No repositories configured for this server. Run `/setup` to add repositories.');
      return;
    }
    const row = buildRepoSelectMenuForSetBranch(guildConfig);
    await message.reply({
      content: '📌 **Choose the repository you want to set your branches for:**',
      components: [row],
    });
    return;
  }

  // 4. My Branches Command as text: "/my-branches", "my-branches", "branches"
  if (['/my-branches', 'my-branches', '/branches', 'branches', '/mybranches', 'mybranches'].includes(content)) {
    const embed = await buildMyBranchesEmbed(message.guildId, message.author.id, guildConfig, guildService);
    await message.reply({ embeds: [embed] });
    return;
  }

  // 5. Any other text in working channel -> Helpful guidance
  const embed = buildDmDashboardEmbed(message.author.username, guildConfig);
  const actionRow = buildDmDashboardButtons();
  await message.reply({
    content: `💡 Tip: Click the buttons below, or type **pr**, **set-branch**, **my-branches**, or **set-token**.`,
    embeds: [embed],
    components: [actionRow],
  });
}

export async function handleDmButton(
  interaction: ButtonInteraction,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (!interaction.guildId) return;
  const { customId, user, guildId } = interaction;

  // 1. My Branches Button
  if (customId === 'dm_btn_my_branches') {
    const embed = await buildMyBranchesEmbed(guildId, user.id, guildConfig, guildService);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // 2. Set Token Button
  if (customId === 'dm_btn_set_token') {
    const existing = await guildService.getUserToken(user.id);
    let masked: string | undefined;
    if (existing) {
      masked = existing.length > 8 ? `${existing.slice(0, 4)}••••${existing.slice(-4)}` : '••••••••';
    }
    const modal = buildSetTokenModal(masked);
    await interaction.showModal(modal);
    return;
  }

  // 3. Create PR Button -> Show Repo Select Menu
  if (customId === 'dm_btn_create_pr') {
    if (guildConfig.repositories.length === 0) {
      await interaction.reply({
        content: '⚠️ No repositories configured for this server. Run `/setup` to add repositories.',
        ephemeral: true,
      });
      return;
    }

    const row = buildRepoSelectMenuForPr(guildConfig);
    await interaction.reply({
      content: '📌 **Choose the repository for your Pull Request:**',
      components: [row],
      ephemeral: true,
    });
    return;
  }

  // 4. Set Branch Button -> Show Repo Select Menu
  if (customId === 'dm_btn_set_branch') {
    if (guildConfig.repositories.length === 0) {
      await interaction.reply({
        content: '⚠️ No repositories configured for this server. Run `/setup` to add repositories.',
        ephemeral: true,
      });
      return;
    }

    const row = buildRepoSelectMenuForSetBranch(guildConfig);
    await interaction.reply({
      content: '📌 **Choose the repository you want to set your branches for:**',
      components: [row],
      ephemeral: true,
    });
    return;
  }
}

export async function handleDmSelectMenu(
  interaction: StringSelectMenuInteraction,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (!interaction.guildId) return;
  const { customId, values, user, guildId } = interaction;
  const repoFullName = values[0];

  const repoConfig = guildConfig.repositories.find(
    r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
  );

  if (!repoConfig) {
    await interaction.reply({
      content: `❌ Repository **${repoFullName}** not found in this server's configuration.`,
      ephemeral: true,
    });
    return;
  }

  // A. Selected Repo for Creating PR
  if (customId === 'dm_select_repo_pr') {
    const branchConfig = await guildService.getUserBranchConfig(guildId, user.id, repoConfig.fullName);

    if (!branchConfig || !branchConfig.branchName) {
      await interaction.update({
        content: `⚠️ You haven't set your branches for **${repoConfig.fullName}** yet.\nClick **Set Branch** or use \`/set-branch\` first!`,
        components: [],
      });
      return;
    }

    // Verify user has personal GitHub token connected
    const userToken = await guildService.getUserToken(user.id);
    if (!userToken) {
      const setTokenBtn = new ButtonBuilder()
        .setCustomId('dm_btn_set_token')
        .setLabel('Connect GitHub Token')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary);
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(setTokenBtn);

      await interaction.update({
        content: `⚠️ You must connect your personal GitHub token before creating a PR so it opens under your own account.`,
        components: [actionRow],
      });
      return;
    }

    const userGitHubService = await guildService.getUserGitHubService(user.id);

    // If GitHubService is available, verify branch changes
    if (userGitHubService) {
      const check = await userGitHubService.compareBranchWithBase(
        repoConfig.owner,
        repoConfig.repo,
        branchConfig.branchName,
        branchConfig.targetBranch
      );

      if (!check.hasChanges) {
        const reason =
          check.errorMessage ||
          `Branch \`${branchConfig.branchName}\` has 0 commits ahead of target branch \`${branchConfig.targetBranch}\` (no file changes).`;
        await interaction.update({
          content: `⚠️ **Cannot create Pull Request:**\n${reason}\n\nPlease push your commits to \`${branchConfig.branchName}\` before creating a PR.`,
          embeds: [],
          components: [],
        });
        return;
      }
    }

    const card = buildPrConfirmationCard(
      {
        ...repoConfig,
        targetBranch: branchConfig.targetBranch,
      },
      branchConfig.branchName,
      guildConfig.channelId
    );

    await interaction.update({
      content: '',
      embeds: [card.embed],
      components: card.components,
    });
    return;
  }

  // B. Selected Repo for Setting Branch -> Open Modal with TWO fields: branch_name and target_branch
  if (customId === 'dm_select_repo_set_branch') {
    const existing = await guildService.getUserBranchConfig(guildId, user.id, repoConfig.fullName);
    const currentBranchName = existing?.branchName || '';
    const currentTargetBranch = existing?.targetBranch || repoConfig.targetBranch || 'QA';

    const modal = new ModalBuilder()
      .setCustomId(`dm_modal_set_branch:${repoConfig.fullName}`)
      .setTitle(`Set Branch: ${repoConfig.repo}`);

    const branchNameInput = new TextInputBuilder()
      .setCustomId('branch_name_input')
      .setLabel('Your Working (From) Branch Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. feature/my-feature or branch-01')
      .setValue(currentBranchName)
      .setRequired(true)
      .setMaxLength(100);

    const targetBranchInput = new TextInputBuilder()
      .setCustomId('target_branch_input')
      .setLabel('Target (To / Base) Branch Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. QA or main')
      .setValue(currentTargetBranch)
      .setRequired(true)
      .setMaxLength(100);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(branchNameInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(targetBranchInput);
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
  }
}

export async function handleDmModalSubmit(
  interaction: ModalSubmitInteraction,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (!interaction.guildId) return;
  if (!interaction.customId.startsWith('dm_modal_set_branch:')) return;

  const repoFullName = interaction.customId.replace('dm_modal_set_branch:', '');
  const repoConfig = guildConfig.repositories.find(
    r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
  );

  if (!repoConfig) {
    await interaction.reply({
      content: `❌ Could not find repository configuration for **${repoFullName}**.`,
      ephemeral: true,
    });
    return;
  }

  const branchName = interaction.fields.getTextInputValue('branch_name_input').trim();
  const targetBranch = interaction.fields.getTextInputValue('target_branch_input').trim() || repoConfig.targetBranch || 'QA';

  await guildService.setUserBranchConfig(
    interaction.guildId,
    interaction.user.id,
    repoConfig.fullName,
    branchName,
    targetBranch
  );

  await interaction.reply({
    content: `✅ Saved in MySQL for **${repoConfig.fullName}**!\n• **branch_name:** \`${branchName}\`\n• **target_branch:** \`${targetBranch}\`\nYou can now click **Create PR** or use \`/pr\` anytime!`,
    ephemeral: true,
  });
}
