/*
 * Copyright (c) 2021 Marvin "NurMarvin" Witt
 * Licensed under the Open Software License version 3.0
 */
import { PrismaClient } from '@prisma/client';
import { Client, TextChannel } from 'discord.js';
import { config } from 'dotenv';
import Command, { CommandContext } from './command';
import CommandSync from './command/commands/sync';
import { tryAssignPronounRole } from './util';

config();

const commands: Command[] = [];

const prisma = new PrismaClient();
const client = new Client();

commands.push(new CommandSync());

export const getGuildConfig = async (id: string) => {
  let guildConfig = await prisma.guildConfig.findUnique({
    where: {
      id,
    },
  });

  if (!guildConfig) {
    guildConfig = await prisma.guildConfig.create({
      data: {
        id,
      },
    });
  }

  return guildConfig;
};

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.user?.setPresence({
    activity: {
      name: `pronoundb.org | ${client.guilds.cache.size} Servers`,
    },
  });
});

client.on('guildCreate', async (guild) => {
  client.user?.setPresence({
    activity: {
      name: `pronoundb.org | ${client.guilds.cache.size} Servers`,
    },
  });

  const guildConfig = await getGuildConfig(guild.id);
  let channel = guild.systemChannel;

  if (!channel) {
    channel = guild.channels.cache.find((c) => {
      if (!c.isText) return false;
      const permissions = c.permissionsFor(client.user!!);

      return !permissions || permissions.has('SEND_MESSAGES');
    }) as TextChannel | null;
  }

  if (!channel) return;

  try {
    await guild.systemChannel?.send(
      `Hi there. Thanks for adding me to your server :hugging:\nIf you haven't already, head over to <https://pronoundb.org> and create an account to set-up your pronouns. That way you can sync your pronouns across multiple other platforms besides just Discord, including Twitter, GitHub, Twitch and many more to come soon!\nIf you want to sync all members that are already on the server, just run the \`sync\` command via \`${guildConfig.prefix}sync\`, otherwise I will just assign a pronoun role to an existing user whenever said user sends a message. New users who join the server will also be given their respective pronoun role!\nAlso if you don't like the name of a pronoun role, just change it, I won't touch it after the initial creation :blush:\n**Note**: I was not created by PronounDB, so please don't bother them if I break, instead join my support server: https://discord.gg/tCk3FskBuB`
    );
  } catch (e) {
    // Ignore, we probably just don't have any channel to talk in
  }
  return;
});

client.on('guildDelete', () => {
  client.user?.setPresence({
    activity: {
      name: `pronoundb.org | ${client.guilds.cache.size} Servers`,
    },
  });
});

client.on('guildMemberAdd', async (member) => {
  await tryAssignPronounRole(member);
});

// Pronoun updating
client.on('message', async (msg) => {
  if (!msg.guild) return;

  await tryAssignPronounRole(msg.member!!);
});

// Command handling
client.on('message', async (msg) => {
  if (!msg.guild || !msg.channel.isText || msg.author.bot) return;

  let { content } = msg;
  const guildConfig = await getGuildConfig(msg.guild.id);

  if (!content.startsWith(guildConfig.prefix)) return;

  content = content.substring(guildConfig.prefix.length);

  const args = content.split(' ');
  const name = args.shift();

  const command = commands.find(
    (command) => command.name.toLowerCase() === name?.toLowerCase()
  );

  if (!command) return;

  command.preExecute(
    new CommandContext(
      args,
      msg.author,
      msg.guild,
      msg.channel as TextChannel,
      msg
    )
  );
});

client.login(process.env.BOT_TOKEN);

export default client;
