/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

import { replacedUserPanelComponent } from "./patches";

const plugin = definePlugin({
    name: "PhilsPluginLibrary",
    description: "A library for phil's plugins",
    authors: [Devs.phil],
    patches: [
        {
            find: "--custom-app-panels-height",
            replacement: {
                match: /(\w+\.\w+\(\w+,{\w+:function\(\){)return (\w)+}/,
                replace: "$1 $self.storedComp = $2; return $self.replacedUserPanelComponent}"
            }
        },
        {
            find: "Unknown frame rate",
            replacement: [
                {
                    match: /(switch\((.{0,10})\).{0,1000})(throw Error\(.{0,100}?Unknown resolution.{0,100}?\))(?=})/,
                    replace: "$1return $2"
                },
                {
                    match: /(switch\((.{0,10})\).{0,1000})(throw Error\(.{0,100}?Unknown frame rate.{0,100}?\))(?=})/,
                    replace: "$1return $2"
                }
            ]
        }
    ]
});
plugin.replacedUserPanelComponent = replacedUserPanelComponent.bind(plugin);
export default plugin;



export * from "./components";
export * from "./discordModules";
export * from "./emitter";
export * from "./icons";
export * from "./patchers";
export * from "./patches";
export * from "./store";
export * as types from "./types";
export * from "./utils";
