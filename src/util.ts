/*
 * Copyright (c) 2021 Marvin "NurMarvin" Witt
 * Licensed under the Open Software License version 3.0
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { DiscordAPIError, Guild, GuildMember } from 'discord.js';
import { createClient } from 'redis';

const prisma = new PrismaClient();
const apiClient = axios.create({
  baseURL: 'https://pronoundb.org/api/v1',
  headers: {
    'User-Agent': `PronounDB-Bot/1.0 (+https://github.com/NurMarvin/pronoundb-bot)`,
  },
});
const redis = createClient(process.env.REDIS_URL || '');

redis.on('connect', (err) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Connected to Redis DB!');
});

const Pronouns: { [key: string]: string | null } = Object.freeze({
  unspecified: null,
  // -- Contributors: please keep the list sorted alphabetically.
  hh: 'He/Him',
  hi: 'He/It',
  hs: 'He/She',
  ht: 'He/They',
  ih: 'It/Him',
  ii: 'It/Its',
  is: 'It/She',
  it: 'It/They',
  shh: 'She/He',
  sh: 'She/Her',
  si: 'She/It',
  st: 'She/They',
  th: 'They/He',
  ti: 'They/It',
  ts: 'They/She',
  tt: 'They/Them',
  // --
  any: 'Any pronouns',
  other: 'Other pronouns',
  ask: 'Ask me my pronouns',
  avoid: 'Avoid pronouns, use my name',
});

const chunkArray = <T>(array: T[], size: number) => {
  const chunkedArray = [];
  let copied = [...array];
  const numOfChild = Math.ceil(copied.length / size);

  for (let i = 0; i < numOfChild; i++) {
    chunkedArray.push(copied.splice(0, size));
  }

  return chunkedArray;
};

export const createPronounRole = async (guild: Guild, pronoun: string) => {
  const role = await guild.roles.create({
    data: {
      permissions: 0,
      mentionable: false,
      hoist: false,
      name: Pronouns[pronoun] || 'Unspecified',
    },
  });

  return await prisma.pronounRole.create({
    data: {
      id: role.id,
      pronoun: pronoun,
      guildConfigId: guild.id,
    },
  });
};

export const tryAssignPronounRole = async (member: GuildMember) => {
  redis.get(`user:${member.id}`, async (_, pronouns) => {
    if (!pronouns) {
      try {
        pronouns = (
          await apiClient.get<{ pronouns: string }>(`/lookup`, {
            params: {
              id: member.user.id,
              platform: 'discord',
            },
          })
        ).data.pronouns;

        redis.setex(`user:${member.id}`, 60, pronouns);
      } catch (e) {
        // Ignore, probably just 404 because the user has no pronouns set
        return;
      }
    }

    await assignPronounRole(member, pronouns);
  });
};

export const tryAssignPronounRolesBulk = async (members: GuildMember[]) => {
  try {
    const chunks = chunkArray(members, 50);

    for (let chunk of chunks) {
      const pronounMap: { [key: string]: string } = {};

      for (let member of chunk) {
        redis.get(`user:${member.id}`, async (_, pronouns) => {
          if (pronouns) {
            pronounMap[member.id] = pronouns;
          }
        });
      }

      const result = await apiClient.get<{ [key: string]: string }>(
        `/lookup-bulk`,
        {
          params: {
            ids: chunk
              .filter((member) => !pronounMap[member.id])
              .map((member) => member.id)
              .join(','),
            platform: 'discord',
          },
        }
      );

      if (result.status === 200) {
        const userIds = Object.keys(result.data);

        userIds.forEach((id) => {
          const pronouns = result.data[id];
          pronounMap[id] = pronouns;
          redis.setex(`user:${id}`, 60, pronouns);
        });

        for (let memberId of Object.keys(pronounMap)) {
          const pronouns = pronounMap[memberId];

          await assignPronounRole(
            members.find((m) => m.id === memberId)!!,
            pronouns
          );
        }
      }
    }
  } catch (e) {
    if (e instanceof DiscordAPIError) {
      throw e;
    }

    // Ignore, probably just 404 because the user has no pronouns set
  }
};

export const assignPronounRole = async (
  member: GuildMember,
  pronoun: string
) => {
  let pronounRole = await prisma.pronounRole.findFirst({
    where: {
      guildConfigId: member.guild.id,
      pronoun,
    },
  });

  if (!pronounRole)
    pronounRole = await createPronounRole(member.guild, pronoun);

  let role = member.guild.roles.resolve(pronounRole.id);

  if (!role)
    role = member.guild.roles.resolve(
      (await createPronounRole(member.guild, pronoun)).id
    );

  // Remove other pronoun roles the user might have
  const pronounRoles = await prisma.guildConfig
    .findUnique({
      where: {
        id: member.guild.id,
      },
    })
    .pronounRoles();

  for (let pronounRole of pronounRoles) {
    if (member.roles.cache.some((role) => role.id == pronounRole.id)) {
      await member.roles.remove(pronounRole.id);
    }
  }

  // Add new pronoun role
  await member.roles.add(role!!);
};
