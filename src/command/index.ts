/*
 * Copyright (c) 2021 Marvin "NurMarvin" Witt
 * Licensed under the Open Software License version 3.0
 */
import {
  Guild,
  GuildMember,
  Message,
  PermissionResolvable,
  PermissionString,
  TextChannel,
  User,
} from 'discord.js';

export default abstract class Command {
  name: string;
  description: string;
  permissions: PermissionString[];

  constructor(
    name: string,
    description: string,
    ...permissions: PermissionString[]
  ) {
    this.name = name;
    this.description = description;
    this.permissions = permissions;
  }

  async preExecute(ctx: CommandContext) {
    if (!ctx.hasPermissions(this.permissions)) {
      await ctx.message.reply(
        `You are missing one or more of the following permissions required to use this command: \`${this.permissions.join(
          ', '
        )}\``
      );
      return;
    }

    try {
      await this.execute(ctx);
    } catch (e) {
      await ctx.message.reply(
        'Oh no, an error occured! The developer has already been informed though, so expect this to be dealt with soon!'
      );
    }
  }

  abstract execute(ctx: CommandContext): Promise<void>;
}

export class CommandContext {
  args: string[];
  user: User;
  guild: Guild;
  channel: TextChannel;
  message: Message;

  constructor(
    args: string[],
    user: User,
    guild: Guild,
    channel: TextChannel,
    message: Message
  ) {
    this.args = args;
    this.user = user;
    this.guild = guild;
    this.channel = channel;
    this.message = message;
  }

  get member(): GuildMember {
    return this.guild.member(this.user)!!;
  }

  hasPermissions(permissions: PermissionResolvable[]): boolean {
    return permissions.every((permission) =>
      this.member.hasPermission(permission)
    );
  }
}
