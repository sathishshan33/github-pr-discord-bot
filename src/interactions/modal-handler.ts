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
import { AppConfig, RepoConfig } from '../config';
import { StorageService } from '../services/storage';
import { GitHubService } from '../services/github';

export function buildPrConfirmationCard(
  repoConfig: RepoConfig,
  fromBranch: string,
  notifierCount = 0
) {
  const embed = new EmbedBuilder()
    .setTitle(`Ready to Create Pull Request`)
    .setColor(0x2b2d31)
    .setDescription(`Review the details below and click **Submit / Create PR** to open the details form.`)
    .addFields(
      { name: 'Repository', value: `\`${repoConfig.fullName}\``, inline: false },
      { name: 'From Branch (Head)', value: `\`${fromBranch}\``, inline: true },
      { name: 'To Branch (Base)', value: `\`${repoConfig.targetBranch}\``, inline: true }
    );

  if (notifierCount > 0) {
    embed.addFields({
      name: '📢 Notifiers (.env)',
      value: `*${notifierCount} Discord user(s) will receive a direct message with the PR link.*`,
      inline: false,
    });
  }

  embed.setFooter({ text: 'Clicking submit will open a modal for PR Title and Description' });

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
  config: AppConfig,
  storage: StorageService
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
    const repoFullName = interaction.customId.replace('pr_open_modal:', '');
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

    const fromBranch = storage.getUserBranch(interaction.user.id, repoConfig.fullName);
    if (!fromBranch) {
      await interaction.reply({
        content: `⚠️ No working branch found for **${repoConfig.fullName}**. Please run \`/set-branch\` first.`,
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`pr_submit_modal:${repoConfig.fullName}`)
      .setTitle(`Create PR: ${repoConfig.repo}`);

    const defaultTitle = `Merge ${fromBranch} into ${repoConfig.targetBranch}`;

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
  config: AppConfig,
  storage: StorageService,
  gitHubService: GitHubService
) {
  if (!interaction.customId.startsWith('pr_submit_modal:')) return;

  const repoFullName = interaction.customId.replace('pr_submit_modal:', '');
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

  const fromBranch = storage.getUserBranch(interaction.user.id, repoConfig.fullName);
  if (!fromBranch) {
    await interaction.reply({
      content: `⚠️ No working branch found for **${repoConfig.fullName}**.`,
      ephemeral: true,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue('pr_title').trim();
  const description = interaction.fields.getTextInputValue('pr_description').trim();

  // Defer reply ephemerally while creating the PR on GitHub
  await interaction.deferReply({ ephemeral: true });

  try {
    const prResult = await gitHubService.createPullRequest({
      owner: repoConfig.owner,
      repo: repoConfig.repo,
      head: fromBranch,
      base: repoConfig.targetBranch,
      title,
      body: description
        ? `${description}\n\n---\n*Created via Discord Bot by @${interaction.user.username}*`
        : `*Created via Discord Bot by @${interaction.user.username}*`,
    });

    // Public PR Embed to share
    const publicEmbed = new EmbedBuilder()
      .setTitle(`🚀 New Pull Request: #${prResult.number} ${prResult.title}`)
      .setURL(prResult.htmlUrl)
      .setColor(0x238636) // GitHub green
      .setDescription(description || '*No description provided.*')
      .addFields(
        { name: 'Repository', value: `[${repoConfig.fullName}](https://github.com/${repoConfig.fullName})`, inline: true },
        { name: 'Branches', value: `\`${fromBranch}\` ➔ \`${repoConfig.targetBranch}\``, inline: true },
        { name: 'Author', value: `${interaction.user}`, inline: true }
      )
      .setFooter({ text: `GitHub Pull Request #${prResult.number} • Status: ${prResult.state.toUpperCase()}` })
      .setTimestamp();

    const notificationPayload = {
      content: `🔔 **${interaction.user}** opened a new pull request: ${prResult.htmlUrl}`,
      embeds: [publicEmbed],
    };

    // 1. Send Direct Messages to all configured NOTIFIER_IDS in .env
    const notifiedSuccess: string[] = [];
    const notifiedFailed: string[] = [];

    for (const userId of config.notifierIds) {
      try {
        const user = await interaction.client.users.fetch(userId);
        if (user) {
          await user.send({
            content: `🔔 **${interaction.user.username}** opened a new pull request: ${prResult.htmlUrl}`,
            embeds: [publicEmbed],
          });
          notifiedSuccess.push(user.toString());
        }
      } catch (err) {
        console.error(`[Notifier Error] Failed to send DM to notifier ${userId}:`, err);
        notifiedFailed.push(`<@${userId}>`);
      }
    }

    // 2. Deliver to PR_NOTIFICATION_CHANNEL_ID (if configured)
    let channelDeliveredLabel = '';
    if (config.prNotificationChannelId) {
      const targetId = config.prNotificationChannelId;
      try {
        const targetChannel = await interaction.client.channels.fetch(targetId).catch(() => null);
        if (targetChannel && targetChannel.isTextBased() && 'send' in targetChannel) {
          await (targetChannel as any).send(notificationPayload);
          channelDeliveredLabel = 'name' in targetChannel ? `#${(targetChannel as any).name}` : 'target channel';
        } else {
          const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
          if (targetUser) {
            await targetUser.send(notificationPayload);
            channelDeliveredLabel = `@${targetUser.username} (DM)`;
          }
        }
      } catch (notifyErr: any) {
        console.error(`[Notification Error] Failed to send notification to ID ${targetId}:`, notifyErr);
      }
    }

    // 3. Confirmation reply to author
    let replyContent = `🎉 Successfully created Pull Request **#${prResult.number}**!\n🔗 ${prResult.htmlUrl}`;

    if (notifiedSuccess.length > 0) {
      replyContent += `\n📢 **Direct notification sent to notifiers (${notifiedSuccess.length}):** ${notifiedSuccess.join(', ')}`;
    }
    if (notifiedFailed.length > 0) {
      replyContent += `\n⚠️ *Could not DM (${notifiedFailed.join(', ')}) - their DMs may be closed.*`;
    }
    if (channelDeliveredLabel) {
      replyContent += `\n📣 Notification sent to: **${channelDeliveredLabel}**`;
    }

    await interaction.editReply({
      content: replyContent,
    });
  } catch (err: any) {
    console.error('[PR Creation Error]:', err);
    await interaction.editReply({
      content: `❌ **Failed to create Pull Request on GitHub:**\n\`${err.message || 'Unknown error'}\`\n\nPlease verify that your branch \`${fromBranch}\` exists remotely on GitHub and has changes compared to \`${repoConfig.targetBranch}\`.`,
    });
  }
}
