/*
 * Copyright (c) 2021 Marvin "NurMarvin" Witt
 * Licensed under the Open Software License version 3.0
 */
import { DiscordAPIError } from 'discord.js';
import Command, { CommandContext } from '..';
import { tryAssignPronounRolesBulk } from '../../util';

export default class CommandSync extends Command {
  constructor() {
    super(
      'sync',
      'Syncs pronoun roles for all members on the server',
      'MANAGE_GUILD'
    );
  }

  async execute(ctx: CommandContext): Promise<void> {
    const members = Array.from((await ctx.guild.members.fetch()).values());

    const message = await ctx.channel.send(
      `Syncing pronoun roles for \`${members.length}\` members. This may take a while...`
    );

    try {
      await tryAssignPronounRolesBulk(members);
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === 50013) {
        message?.edit(
          "Oh no, looks like I don't have enough permissions to assign pronoun roles :sob: Could you please look if someone accidentally moved my role below any of the pronoun roles or revoked my `Manage Roles` permission? :pleading_face:"
        );
        return;
      }
    }

    await message?.edit(
      `Successfully synced pronoun roles for \`${members.length}\` members!`
    );
  }
}
