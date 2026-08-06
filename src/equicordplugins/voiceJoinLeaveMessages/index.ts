/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Message, User } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { FluxDispatcher, MessageActions, MessageStore, RelationshipStore, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

const createBotMessage = findByCodeLazy('username:"Clyde"');

const EPHEMERAL = 1 << 6;
// When joining a voice channel, Discord sends voice states for everyone already in it.
// Those must not be announced as joins, so they are suppressed for a short while.
const JOIN_SUPPRESSION_MS = 5000;

const settings = definePluginSettings({
    joinMessages: {
        type: OptionType.BOOLEAN,
        description: "Show a message when someone joins your voice channel",
        default: true
    },
    leaveMessages: {
        type: OptionType.BOOLEAN,
        description: "Show a message when someone leaves your voice channel",
        default: true
    },
    moveMessages: {
        type: OptionType.BOOLEAN,
        description: "Mention the other voice channel when someone moves in from or out to it",
        default: true
    },
    showSelf: {
        type: OptionType.BOOLEAN,
        description: "Show messages for your own joins and leaves",
        default: false
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Do not show messages for bots",
        default: true
    },
    ignoreBlockedUsers: {
        type: OptionType.BOOLEAN,
        description: "Do not show messages for blocked users",
        default: true
    }
});

interface VoiceState {
    guildId?: string;
    channelId?: string;
    oldChannelId?: string;
    user: User;
    userId: string;
}

let currentChannelId: string | undefined;
let joinedAt = 0;
const knownUsers = new Set<string>();

function syncChannel(channelId: string | undefined) {
    currentChannelId = channelId;
    joinedAt = Date.now();
    knownUsers.clear();
    if (!channelId) return;

    const states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
    for (const userId of Object.keys(states)) knownUsers.add(userId);
}

function shouldAnnounce(userId: string) {
    if (userId === UserStore.getCurrentUser()?.id) return settings.store.showSelf;
    if (settings.store.ignoreBots && UserStore.getUser(userId)?.bot) return false;
    if (settings.store.ignoreBlockedUsers && RelationshipStore.isBlocked(userId)) return false;
    return true;
}

function sendEphemeralMessage(channelId: string, content: string, userId: string) {
    const message: Message = createBotMessage({ channelId, content, embeds: [] });
    message.flags = EPHEMERAL;

    const user = UserStore.getUser(userId);
    if (user) message.author = user;

    // If we send a message into an unloaded channel, the client-sided messages get
    // overwritten once the channel actually loads, so wait for it first
    const messagesLoaded: Promise<any> = MessageStore.hasPresent(channelId)
        ? Promise.resolve()
        : MessageActions.fetchMessages({ channelId });

    messagesLoaded.then(() => {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId,
            message,
            optimistic: true,
            sendMessageOptions: {},
            isPushNotification: false
        });
    });
}

export default definePlugin({
    name: "VoiceJoinLeaveMessages",
    description: "Logs joins and leaves of your current voice channel as ephemeral messages in its text chat",
    tags: ["Servers", "Utility", "Voice"],
    authors: [Devs.Sqaaakoi, Devs.thororen],
    settings,

    flux: {
        VOICE_CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            syncChannel(channelId ?? undefined);
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myChannelId = SelectedChannelStore.getVoiceChannelId() ?? undefined;
            // VOICE_CHANNEL_SELECT may not have fired yet, seed from the store instead of announcing everyone
            if (myChannelId !== currentChannelId) syncChannel(myChannelId);
            if (!currentChannelId) return;

            const suppressJoins = Date.now() - joinedAt < JOIN_SUPPRESSION_MS;

            for (const state of voiceStates) {
                const { userId, channelId, oldChannelId } = state;

                if (channelId === currentChannelId) {
                    if (knownUsers.has(userId)) continue;
                    knownUsers.add(userId);

                    if (suppressJoins || !settings.store.joinMessages || !shouldAnnounce(userId)) continue;

                    const movedFrom = oldChannelId && oldChannelId !== channelId && settings.store.moveMessages;
                    sendEphemeralMessage(
                        currentChannelId,
                        movedFrom ? `Moved here from <#${oldChannelId}>` : "Joined the voice channel",
                        userId
                    );
                } else {
                    if (!knownUsers.delete(userId)) continue;
                    if (!settings.store.leaveMessages || !shouldAnnounce(userId)) continue;

                    const movedTo = channelId && settings.store.moveMessages;
                    sendEphemeralMessage(
                        currentChannelId,
                        movedTo ? `Moved to <#${channelId}>` : "Left the voice channel",
                        userId
                    );
                }
            }
        }
    },

    start() {
        syncChannel(SelectedChannelStore.getVoiceChannelId() ?? undefined);
    },

    stop() {
        currentChannelId = undefined;
        knownUsers.clear();
    }
});
