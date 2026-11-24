import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RepoConfig } from '../config';
import { GuildRuntimeConfig, GuildService } from '../services/guild-service';

export function buildPrConfirmationCard(
  repoConfig: RepoConfig,
  fromBranch: string,
  channelId?: string
) {
  const channelText = channelId ? `<#${channelId}>` : 'this channel';

  const embed = new EmbedBuilder()
    .setTitle(`Ready to Create Pull Request`)
    .setColor(0x2b2d31)
    .setDescription(`Review the details below and click **Submit / Create PR** to open the details form.`)
    .addFields(
      { name: 'Repository', value: `\`${repoConfig.fullName}\``, inline: false },
      { name: 'From Branch (Head)', value: `\`${fromBranch}\``, inline: true },
      { name: 'To Branch (Base)', value: `\`${repoConfig.targetBranch}\``, inline: true },
      {
        name: '📢 Public Announcement',
        value: `*Upon submission, the PR link will be posted in ${channelText} for everyone to see.*`,
        inline: false,
      }
    )
    .setFooter({ text: 'PR will be opened under your personal GitHub account' });

  const submitBtn = new ButtonBuilder()
    .setCustomId(`pr_open_modal:${repoConfig.fullName}`)
    .setLabel('Submit / Create PR')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🚀');

  const cancelBtn = new ButtonBuilder()
    .setCustomId('pr_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(submitBtn, cancelBtn);

  return { embed, components: [actionRow] };
}

export async function handlePrButtonInteraction(
  interaction: ButtonInteraction,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (interaction.customId === 'pr_cancel') {
    await interaction.update({
      content: '❌ PR creation cancelled.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (interaction.customId.startsWith('pr_open_modal:')) {
    if (!interaction.guildId) return;

    const repoFullName = interaction.customId.replace('pr_open_modal:', '');
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

    const branchConfig = await guildService.getUserBranchConfig(interaction.guildId, interaction.user.id, repoConfig.fullName);
    if (!branchConfig || !branchConfig.branchName) {
      await interaction.reply({
        content: `⚠️ No working branches found for **${repoConfig.fullName}**. Please set your branches first.`,
        ephemeral: true,
      });
      return;
    }

    const gitHubService = await guildService.getUserGitHubService(interaction.user.id);
    if (!gitHubService) {
      const setTokenBtn = new ButtonBuilder()
        .setCustomId('dm_btn_set_token')
        .setLabel('Connect GitHub Token')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary);
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(setTokenBtn);

      await interaction.reply({
        content: `❌ You must connect your personal GitHub token first so the PR is opened under your GitHub account.`,
        components: [actionRow],
        ephemeral: true,
      });
      return;
    }

    // Pre-flight check: verify branch has changes compared to target branch before showing modal
    const check = await gitHubService.compareBranchWithBase(
      repoConfig.owner,
      repoConfig.repo,
      branchConfig.branchName,
      branchConfig.targetBranch
    );

    if (!check.hasChanges) {
      const reason =
        check.errorMessage ||
        `Branch \`${branchConfig.branchName}\` has 0 commits ahead of target branch \`${branchConfig.targetBranch}\` (no file changes).`;
      await interaction.reply({
        content: `⚠️ **Cannot create Pull Request:**\n${reason}\n\nPlease make sure your branch is pushed and has changes compared to \`${branchConfig.targetBranch}\`.`,
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`pr_submit_modal:${repoConfig.fullName}`)
      .setTitle(`Create PR: ${repoConfig.repo}`);

    const defaultTitle = `Merge ${branchConfig.branchName} into ${branchConfig.targetBranch}`;

    const titleInput = new TextInputBuilder()
      .setCustomId('pr_title')
      .setLabel('Pull Request Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(defaultTitle)
      .setValue(defaultTitle)
      .setRequired(true)
      .setMaxLength(256);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('pr_description')
      .setLabel('Pull Request Description (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Details about this change...')
      .setRequired(false)
      .setMaxLength(4000);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

    modal.addComponents(firstRow, secondRow);

    await interaction.showModal(modal);
  }
}

export async function handlePrModalSubmit(
  interaction: ModalSubmitInteraction,
  guildConfig: GuildRuntimeConfig,
  guildService: GuildService
) {
  if (!interaction.customId.startsWith('pr_submit_modal:')) return;
  if (!interaction.guildId) return;

  const repoFullName = interaction.customId.replace('pr_submit_modal:', '');
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

  const branchConfig = await guildService.getUserBranchConfig(interaction.guildId, interaction.user.id, repoConfig.fullName);
  if (!branchConfig || !branchConfig.branchName) {
    await interaction.reply({
      content: `⚠️ No working branches found for **${repoConfig.fullName}**.`,
      ephemeral: true,
    });
    return;
  }

  const gitHubService = await guildService.getUserGitHubService(interaction.user.id);
  if (!gitHubService) {
    await interaction.reply({
      content: `❌ Personal GitHub token not found. Please run \`/set-token\` to connect your account.`,
      ephemeral: true,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue('pr_title').trim();
  const description = interaction.fields.getTextInputValue('pr_description').trim();

  // Defer reply ephemerally while checking diff and creating PR
  await interaction.deferReply({ ephemeral: true });

  try {
    // Secondary check: ensure branch has changes before opening PR
    const check = await gitHubService.compareBranchWithBase(
      repoConfig.owner,
      repoConfig.repo,
      branchConfig.branchName,
      branchConfig.targetBranch
    );

    if (!check.hasChanges) {
      const reason =
        check.errorMessage ||
        `Branch \`${branchConfig.branchName}\` has 0 commits ahead of target branch \`${branchConfig.targetBranch}\`.`;
      await interaction.editReply({
        content: `⚠️ **Cannot create Pull Request:**\n${reason}\n\nNo changes were found to merge into \`${branchConfig.targetBranch}\`.`,
      });
      return;
    }

    const prResult = await gitHubService.createPullRequest({
      owner: repoConfig.owner,
      repo: repoConfig.repo,
      head: branchConfig.branchName,
      base: branchConfig.targetBranch,
      title,
      body: description
        ? `${description}\n\n---\n*Created via Discord Bot by @${interaction.user.username}*`
        : `*Created via Discord Bot by @${interaction.user.username}*`,
    });

    // Public PR Embed to share in configured channel
    const publicEmbed = new EmbedBuilder()
      .setTitle(`🚀 New Pull Request: #${prResult.number} ${prResult.title}`)
      .setURL(prResult.htmlUrl)
      .setColor(0x238636) // GitHub green
      .setDescription(description || '*No description provided.*')
      .addFields(
        { name: 'Repository', value: `[${repoConfig.fullName}](https://github.com/${repoConfig.fullName})`, inline: true },
        { name: 'Branches', value: `\`${branchConfig.branchName}\` ➔ \`${branchConfig.targetBranch}\``, inline: true },
        { name: 'Author', value: `${interaction.user}`, inline: true }
      )
      .setFooter({ text: `GitHub Pull Request #${prResult.number} • Status: ${prResult.state.toUpperCase()}` })
      .setTimestamp();

    const notificationPayload = {
      content: `📢 **${interaction.user}** opened a new pull request: ${prResult.htmlUrl}`,
      embeds: [publicEmbed],
    };

    // Send normal public message into the configured working channel so everyone can see the link
    const targetChannelId = guildConfig.channelId || interaction.channelId;
    let channelAnnounced = false;

    if (targetChannelId) {
      try {
        const channel = await interaction.client.channels.fetch(targetChannelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          await (channel as any).send(notificationPayload);
          channelAnnounced = true;
        }
      } catch (notifyErr: any) {
        console.error(`[Notification Error] Failed to send public PR message to channel ${targetChannelId}:`, notifyErr);
      }
    }

    // Confirmation reply to the author
    const channelMention = targetChannelId ? `<#${targetChannelId}>` : 'the channel';
    let replyContent = `🎉 Successfully created Pull Request **#${prResult.number}** under your GitHub account!\n🔗 ${prResult.htmlUrl}`;
    if (channelAnnounced) {
      replyContent += `\n\n📢 Announced in ${channelMention} so all team members can see it!`;
    }

    await interaction.editReply({
      content: replyContent,
    });
  } catch (err: any) {
    console.error('[PR Creation Error]:', err);
    await interaction.editReply({
      content: `❌ **Failed to create Pull Request on GitHub:**\n\`${err.message || 'Unknown error'}\`\n\nPlease verify that your branch \`${branchConfig.branchName}\` exists remotely on GitHub and has changes compared to \`${branchConfig.targetBranch}\`.`,
    });
  }
}
