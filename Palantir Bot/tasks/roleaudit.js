/**
 * Weekly access-role audit.
 *
 * For every guild that has a `redditRole` configured, finds members holding that
 * role and removes it from anyone who:
 *   - has no linked Reddit username, or
 *   - whose linked Reddit username is not in the synced member list (luxelife_users)
 *
 * Exempt: bots and anyone with the Server Team role.
 *
 * Environment variables (all optional):
 *   ROLE_AUDIT_LIVE=true        Actually remove roles. Anything else = dry run (log only).
 *   ROLE_AUDIT_MAX_REMOVALS=25  Abort if a single run would remove more than this many
 *                               (or more than half the role holders, whichever is larger).
 *   ROLE_AUDIT_MAX_SYNC_AGE_H=36  Abort if the Reddit sync hasn't succeeded this recently.
 *   LUXELIFE_DB=discord         Database holding the luxelife_users collection.
 *   ROLE_AUDIT_CRON="0 3 * * 0" Schedule (default: Sundays 03:00).
 */
const cron = require('node-cron');
const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');
const userSchema = require('../models/userSchema.js');
const serverSchema = require('../models/serverSchema.js');

const EXEMPT_ROLE_ID = '1045083886369132625'; // Server Team
const LIVE = process.env.ROLE_AUDIT_LIVE === 'true';
const MAX_REMOVALS = parseInt(process.env.ROLE_AUDIT_MAX_REMOVALS || '25', 10);
const MAX_SYNC_AGE_H = parseInt(process.env.ROLE_AUDIT_MAX_SYNC_AGE_H || '36', 10);
const LUXELIFE_DB = process.env.LUXELIFE_DB || 'discord';
const SCHEDULE = process.env.ROLE_AUDIT_CRON || '0 3 * * 0';

let running = false;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(name) {
    return String(name || '').trim().replace(/^\/?u\//i, '').toLowerCase();
}

async function postLog(guild, logChannelId, title, lines, color) {
    let description = lines.join('\n');
    console.log(`[roleAudit] ${title}\n${description}`);
    if (!logChannelId) return;
    try {
        const channel = await guild.channels.fetch(logChannelId);
        if (description.length > 3900) {
            description = description.slice(0, 3900) + '\n…(truncated, see console log)';
        }
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description || '(nothing to report)')
            .setColor(color)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('[roleAudit] Failed to post to log channel:', err.message);
    }
}

// Load the set of current group members (lowercased) and confirm the sync is fresh.
async function loadMemberSet() {
    const collection = mongoose.connection.getClient().db(LUXELIFE_DB).collection('luxelife_users');

    const total = await collection.countDocuments();
    if (total === 0) {
        throw new Error('luxelife_users is empty - refusing to audit.');
    }

    const newest = await collection.find({ last_synced: { $exists: true } })
        .sort({ last_synced: -1 }).limit(1).toArray();
    if (newest.length === 0) {
        throw new Error('No last_synced timestamps found - the Reddit sync has not run with the updated code yet.');
    }
    const ageHours = (Date.now() - newest[0].last_synced.getTime()) / 36e5;
    if (ageHours > MAX_SYNC_AGE_H) {
        throw new Error(`Reddit sync is stale (last success ${ageHours.toFixed(1)}h ago, limit ${MAX_SYNC_AGE_H}h).`);
    }

    const docs = await collection.find({}, { projection: { username: 1 } }).toArray();
    return new Set(docs.map(d => normalize(d.username)));
}

async function auditGuild(client, serverData) {
    const guild = await client.guilds.fetch(serverData.guildId).catch(() => null);
    if (!guild) return console.error(`[roleAudit] Guild ${serverData.guildId} not found.`);

    const role = await guild.roles.fetch(serverData.redditRole).catch(() => null);
    if (!role) {
        return console.error(`[roleAudit] Role ${serverData.redditRole} not found in ${guild.name}.`);
    }

    if (LIVE && !role.editable) {
        const msg = `Cannot manage <@&${role.id}>: the bot needs Manage Roles and its role must sit above it.`;
        console.error(`[roleAudit] ${guild.name}: ${msg}`);
        return postLog(guild, serverData.logChannelId, 'Role audit aborted', [`⚠️ ${msg}`], 'Orange');
    }

    let memberSet;
    try {
        memberSet = await loadMemberSet();
    } catch (err) {
        console.error(`[roleAudit] ${guild.name}: ${err.message}`);
        return postLog(guild, serverData.logChannelId, 'Role audit aborted',
            [`⚠️ ${err.message}`, 'No roles were changed.'], 'Orange');
    }

    await guild.members.fetch(); // requires the Server Members intent
    const holders = [...role.members.values()].filter(m =>
        !m.user.bot && !m.roles.cache.has(EXEMPT_ROLE_ID));

    const links = await userSchema.find({ userId: { $in: holders.map(m => m.id) } }).lean();
    const linkByUserId = new Map(links.map(l => [l.userId, l]));

    const toRemove = [];
    for (const member of holders) {
        const link = linkByUserId.get(member.id);
        if (!link?.redditUsername) {
            toRemove.push({ member, reason: 'no linked Reddit account' });
        } else if (!memberSet.has(normalize(link.redditUsername))) {
            toRemove.push({ member, reason: `u/${link.redditUsername} is not in the member list` });
        }
    }

    const noLink = toRemove.filter(r => r.reason === 'no linked Reddit account').length;
    const notInList = toRemove.length - noLink;
    const diagnostics = `Diagnostics: ${memberSet.size} usernames in luxelife_users; ${links.length} of ${holders.length} role holders have a linked Reddit account; ${noLink} flagged for no link, ${notInList} flagged for link not in member list.`;

    const cap = Math.max(MAX_REMOVALS, Math.floor(holders.length / 2));
    console.log(`[roleAudit] ${guild.name}: ${holders.length} checked, ${toRemove.length} to remove (cap ${cap}, ${LIVE ? 'LIVE' : 'DRY RUN'}).`);
    console.log(`[roleAudit] ${diagnostics}`);

    if (toRemove.length > cap) {
        return postLog(guild, serverData.logChannelId, 'Role audit aborted',
            [`⚠️ ${toRemove.length} removals exceeds the safety cap of ${cap}. No roles were changed.`,
             diagnostics,
             'Sample: ' + toRemove.slice(0, 10).map(r => `${r.member.user.tag} (${r.reason})`).join('; '),
             'If this is expected, raise ROLE_AUDIT_MAX_REMOVALS and run again.'], 'Orange');
    }

    const lines = [];
    let failed = 0;
    for (const { member, reason } of toRemove) {
        if (LIVE) {
            try {
                await member.roles.remove(role, `Weekly Reddit membership audit: ${reason}`);
                lines.push(`❌ ${member} (${member.user.tag}) - ${reason}`);
            } catch (err) {
                failed++;
                lines.push(`⚠️ Failed to remove from ${member} (${member.user.tag}): ${err.message}`);
            }
            await delay(500);
        } else {
            lines.push(`Would remove: ${member} (${member.user.tag}) - ${reason}`);
        }
    }

    const title = LIVE ? 'Weekly role audit' : 'Weekly role audit (DRY RUN - no changes made)';
    const summary = `Checked ${holders.length} member(s); ${LIVE ? `removed ${toRemove.length - failed}` : `${toRemove.length} would be removed`}${failed ? `, ${failed} failed` : ''}.`;
    await postLog(guild, serverData.logChannelId, title,
        [summary, diagnostics, '', ...(lines.length ? lines : ['Everyone checks out.'])],
        LIVE && toRemove.length ? 'Red' : 'Green');
}

async function runAudit(client) {
    if (running) return console.log('[roleAudit] Already running, skipping.');
    running = true;
    try {
        const servers = await serverSchema.find({ redditRole: { $exists: true, $ne: null } }).lean();
        for (const serverData of servers) {
            try {
                await auditGuild(client, serverData);
            } catch (err) {
                console.error(`[roleAudit] Error auditing guild ${serverData.guildId}:`, err);
            }
        }
    } finally {
        running = false;
    }
}

function start(client) {
    cron.schedule(SCHEDULE, () => runAudit(client));
    console.log(`[roleAudit] Scheduled "${SCHEDULE}" (${LIVE ? 'LIVE' : 'DRY RUN'} mode).`);
}

module.exports = { start, runAudit };