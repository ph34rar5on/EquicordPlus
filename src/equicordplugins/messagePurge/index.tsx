/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { makeRange, OptionType } from "@utils/types";

import { openPurgeModal } from "./PurgeModal";

export const settings = definePluginSettings({
    searchDelayMs: {
        type: OptionType.SLIDER,
        description: "Delay between search requests while purging (ms). Increases automatically if rate limited.",
        default: 1500,
        markers: makeRange(500, 5000, 500),
    },
    deleteDelayMs: {
        type: OptionType.SLIDER,
        description: "Delay between delete requests while purging (ms). Increases automatically if rate limited.",
        default: 1000,
        markers: makeRange(250, 5000, 250),
    }
});

function PurgeIcon() {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20}>
            <path fill="currentColor" d="M15 3.999V2H9V3.999H3V5.999H21V3.999H15Z" />
            <path fill="currentColor" d="M5 8V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V8H5ZM11 17H9V11H11V17ZM15 17H13V11H15V17Z" />
        </svg>
    );
}

function PurgeHeaderButton() {
    return (
        <HeaderBarButton
            className="vc-messagepurge-btn"
            onClick={() => openPurgeModal()}
            tooltip="Purge Messages"
            icon={PurgeIcon}
        />
    );
}

export default definePlugin({
    name: "MessagePurge",
    description: "Bulk delete messages by server, channel, author, or content filters, with progress tracking and rate-limit backoff.",
    tags: ["Chat", "Utility"],
    authors: [EquicordDevs.nobody],
    dependencies: ["HeaderBarAPI"],
    settings,

    headerBarButton: {
        icon: PurgeIcon,
        render: PurgeHeaderButton,
    }
});
