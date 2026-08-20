/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sleep } from "@utils/misc";
import { Constants, MessageActions, RestAPI } from "@webpack/common";

export interface PurgeOptions {
    guildId: string;
    channelId: string;
    authorId: string;
    content: string;
    has?: "link" | "file";
    includeNsfw: boolean;
    includePinned: boolean;
    minId: string;
    maxId: string;
    pattern: string;
    searchDelayMs: number;
    deleteDelayMs: number;
    maxAttempts: number;
    dryRun: boolean;
}

export interface PurgeState {
    running: boolean;
    paused: boolean;
    done: boolean;
    offset: number;
    grandTotal: number;
    deletedCount: number;
    failedCount: number;
    skippedCount: number;
    iterations: number;
    etaMs: number;
}

export type LogLevel = "info" | "warn" | "error" | "success";

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
}

export interface PurgeCallbacks {
    onProgress(state: PurgeState): void;
    onLog(entry: LogEntry): void;
    onStop(state: PurgeState): void;
}

export interface PurgeEngine {
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
}

interface RawSearchMessage {
    id: string;
    channel_id: string;
    type: number;
    pinned?: boolean;
    content?: string;
    hit?: boolean;
}

interface SearchResponseBody {
    total_results: number;
    messages: RawSearchMessage[][];
}

interface RestError {
    status?: number;
    body?: { retry_after?: number; };
}

const OFFSET_CAP = 5000;
const STOPPED = Symbol("stopped");

function isRestError(e: unknown): e is RestError {
    return typeof e === "object" && e !== null && ("status" in e || "body" in e);
}

function describeError(e: unknown): string {
    if (isRestError(e) && e.status) return `HTTP ${e.status}`;
    if (e instanceof Error) return e.message;
    return "Unknown error";
}

function decrementSnowflake(id: string): string {
    return (BigInt(id) - 1n).toString();
}

export function createPurgeEngine(options: PurgeOptions, callbacks: PurgeCallbacks): PurgeEngine {
    const isDM = options.guildId === "@me";

    const state: PurgeState = {
        running: false,
        paused: false,
        done: false,
        offset: 0,
        grandTotal: 0,
        deletedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        iterations: 0,
        etaMs: 0,
    };

    let currentMaxId = options.maxId || undefined;
    let oldestSeenId: string | undefined;
    let searchDelay = options.searchDelayMs;
    let deleteDelay = options.deleteDelayMs;
    let stopRequested = false;
    let pauseRequested = false;

    function log(level: LogLevel, message: string) {
        callbacks.onLog({ level, message, timestamp: Date.now() });
    }

    function emitProgress() {
        const remaining = Math.max(0, state.grandTotal - state.deletedCount - state.failedCount);
        state.etaMs = remaining * deleteDelay;
        callbacks.onProgress({ ...state });
    }

    function trackOldest(id: string) {
        if (!oldestSeenId || BigInt(id) < BigInt(oldestSeenId)) oldestSeenId = id;
    }

    async function waitWhilePaused() {
        while (pauseRequested && !stopRequested) {
            await sleep(250);
        }
        if (stopRequested) throw STOPPED;
    }

    async function search(): Promise<SearchResponseBody> {
        if (stopRequested) throw STOPPED;

        const url = isDM
            ? `/channels/${options.channelId}/messages/search`
            : Constants.Endpoints.SEARCH_GUILD(options.guildId);

        try {
            const res = await RestAPI.get({
                url,
                query: {
                    author_id: options.authorId || undefined,
                    channel_id: !isDM && options.channelId ? options.channelId : undefined,
                    min_id: options.minId || undefined,
                    max_id: currentMaxId,
                    sort_by: "timestamp",
                    sort_order: "desc",
                    offset: state.offset,
                    has: options.has,
                    content: options.content || undefined,
                    include_nsfw: options.includeNsfw || undefined,
                }
            });

            if (res.status === 202) {
                const retryAfter = ((res.body?.retry_after as number | undefined) ?? 1) * 1000;
                log("info", `Channel isn't indexed yet. Waiting ${Math.round(retryAfter / 1000)}s for Discord to index it...`);
                await sleep(retryAfter);
                return search();
            }

            return res.body as SearchResponseBody;
        } catch (e) {
            if (e === STOPPED) throw e;

            if (isRestError(e) && e.status === 429) {
                const retryAfter = (e.body?.retry_after ?? 1) * 1000;
                searchDelay = Math.max(searchDelay, retryAfter + 250);
                log("warn", `Rate limited while searching. Waiting ${Math.round(retryAfter / 1000)}s...`);
                await sleep(retryAfter);
                return search();
            }

            throw e;
        }
    }

    async function deleteMessage(channelId: string, id: string): Promise<"deleted" | "failed"> {
        for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
            if (stopRequested) throw STOPPED;

            try {
                await MessageActions.deleteMessage(channelId, id);
                return "deleted";
            } catch (e) {
                if (isRestError(e) && e.status === 429) {
                    const retryAfter = (e.body?.retry_after ?? 1) * 1000;
                    deleteDelay = Math.max(deleteDelay, retryAfter + 250);
                    log("warn", `Rate limited while deleting. Waiting ${Math.round(retryAfter / 1000)}s...`);
                    await sleep(retryAfter);
                    continue;
                }

                if (attempt >= options.maxAttempts) {
                    log("error", `Failed to delete message ${id}: ${describeError(e)}`);
                    return "failed";
                }

                await sleep(deleteDelay);
            }
        }

        return "failed";
    }

    function extractHits(data: SearchResponseBody) {
        const groups = data.messages.map(group => group.find(m => m.hit) ?? group[0]).filter((m): m is RawSearchMessage => m != null);

        const pattern = options.pattern ? new RegExp(options.pattern, "i") : null;

        const deletable: RawSearchMessage[] = [];
        let skipped = 0;

        for (const msg of groups) {
            if (!options.includePinned && msg.pinned) {
                skipped++;
                continue;
            }
            if (pattern && !pattern.test(msg.content ?? "")) {
                skipped++;
                continue;
            }
            deletable.push(msg);
        }

        return { hits: groups, deletable, skipped };
    }

    async function runLoop() {
        state.running = true;
        state.done = false;
        emitProgress();
        log("info", options.dryRun ? "Counting matching messages..." : "Starting purge run.");

        try {
            while (!stopRequested) {
                await waitWhilePaused();

                state.iterations++;
                const data = await search();

                if (data.total_results > state.grandTotal) state.grandTotal = data.total_results;

                if (options.dryRun) {
                    log("success", `Found ~${data.total_results} matching messages.`);
                    break;
                }

                const { hits, deletable, skipped } = extractHits(data);

                if (hits.length === 0) {
                    log("success", "No more matching messages found. Purge complete.");
                    state.done = true;
                    break;
                }

                if (deletable.length > 0) {
                    for (const msg of deletable) {
                        await waitWhilePaused();

                        const result = await deleteMessage(msg.channel_id, msg.id);
                        if (result === "deleted") state.deletedCount++;
                        else state.failedCount++;

                        trackOldest(msg.id);
                        emitProgress();
                        await sleep(deleteDelay);
                    }
                } else {
                    state.skippedCount += skipped;
                    state.offset += hits.length;
                    hits.forEach(m => trackOldest(m.id));
                    log("info", `Skipped ${skipped} non-matching message(s) on this page.`);
                }

                if (state.offset >= OFFSET_CAP) {
                    if (oldestSeenId) {
                        const newMax = decrementSnowflake(oldestSeenId);
                        if (options.minId && BigInt(newMax) <= BigInt(options.minId)) {
                            log("success", "Reached the minimum id bound. Purge complete.");
                            state.done = true;
                            break;
                        }
                        currentMaxId = newMax;
                        state.offset = 0;
                        oldestSeenId = undefined;
                        log("info", "Narrowing search window past Discord's search offset limit.");
                    } else {
                        log("warn", "Hit Discord's search offset limit and can't narrow further. Stopping.");
                        state.done = true;
                        break;
                    }
                }

                emitProgress();
                await sleep(searchDelay);
            }
        } catch (e) {
            if (e !== STOPPED) {
                log("error", `Purge stopped due to an error: ${describeError(e)}`);
            } else {
                log("info", "Stopped.");
            }
        }

        state.running = false;
        state.paused = false;
        emitProgress();
        callbacks.onStop({ ...state });
    }

    return {
        start() {
            if (state.running) return;
            stopRequested = false;
            pauseRequested = false;
            void runLoop();
        },
        pause() {
            if (!state.running) return;
            pauseRequested = true;
            state.paused = true;
            emitProgress();
        },
        resume() {
            pauseRequested = false;
            state.paused = false;
            emitProgress();
        },
        stop() {
            stopRequested = true;
            pauseRequested = false;
        },
    };
}
