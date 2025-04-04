/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Channel } from "discord-types/general";

export default definePlugin({
    name: "CleanChannelName",
    authors: [Devs.AutumnVN],
    description: "remove all emoji and decor shit from channel names",
    patches: [
        {
            find: "loadAllGuildAndPrivateChannelsFromDisk(){",
            replacement: {
                match: /(?<=getChannel\(\i\)\{if\(null!=\i\)return )\i\(\i\)/,
                replace: "$self.cleanChannelName($&)",
            }
        }
    ],

    cleanChannelName(channel?: Channel) {
        if (channel) {
            channel.name = channel.name
                .normalize("NFKC")
                .replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ]/g, match => {
                    const smallCapsToNormal = {
                        "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ꜰ": "f", "ɢ": "g", "ʜ": "h", "ɪ": "i", "ᴊ": "j",
                        "ᴋ": "k", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴏ": "o", "ᴘ": "p", "ǫ": "q", "ʀ": "r", "ꜱ": "s", "ᴛ": "t",
                        "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "x": "x", "ʏ": "y", "ᴢ": "z"
                    };
                    return smallCapsToNormal[match];
                })
                .replace(/-+/g, " ") // Replace dashes with spaces
                .replace(/(^\s+|\s+$)/g, "") // Trim leading and trailing spaces
                .replace(/\s+/g, " "); // Replace multiple spaces with a single space
        }
        return channel;
    }
});
