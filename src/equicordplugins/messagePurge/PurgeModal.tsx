/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { getCurrentChannel, getCurrentGuild } from "@utils/discord";
import { RenderModalProps } from "@vencord/discord-types";
import { Alerts, Checkbox, Modal, openModal, ScrollerThin, Select, showToast, TextInput, Toasts, useRef, UserStore, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { settings } from ".";
import { createPurgeEngine, LogEntry, PurgeEngine, PurgeOptions, PurgeState } from "./engine";

const cl = classNameFactory("vc-messagepurge-");

const HAS_OPTIONS = [
    { value: "", label: "Any" },
    { value: "link", label: "Has link" },
    { value: "file", label: "Has file" },
];

const MAX_LOG_LINES = 300;

interface FormState {
    guildId: string;
    channelId: string;
    authorId: string;
    content: string;
    hasFilter: string;
    includeNsfw: boolean;
    includePinned: boolean;
    minId: string;
    maxId: string;
    pattern: string;
}

function makeDefaultForm(): FormState {
    const channel = getCurrentChannel();
    const guild = getCurrentGuild();
    return {
        guildId: guild?.id ?? "@me",
        channelId: channel?.id ?? "",
        authorId: UserStore.getCurrentUser()?.id ?? "",
        content: "",
        hasFilter: "",
        includeNsfw: false,
        includePinned: false,
        minId: "",
        maxId: "",
        pattern: "",
    };
}

function formatEta(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    const totalSeconds = Math.round(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function Field({ label, children }: { label: string; children: ReactNode; }) {
    return (
        <div className={cl("field")}>
            <Heading tag="h5" className={cl("field-label")}>{label}</Heading>
            {children}
        </div>
    );
}

function TargetRow({ label, value, onChange, onUseCurrent }: {
    label: string;
    value: string;
    onChange(v: string): void;
    onUseCurrent(): void;
}) {
    return (
        <Field label={label}>
            <div className={cl("target-row")}>
                <TextInput value={value} onChange={onChange} placeholder="ID" />
                <Button size="small" variant="secondary" onClick={onUseCurrent}>Use current</Button>
            </div>
        </Field>
    );
}

function PurgeModalInner({ modalProps }: { modalProps: RenderModalProps; }) {
    const [form, setForm] = useState<FormState>(makeDefaultForm);
    const [state, setState] = useState<PurgeState | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const engineRef = useRef<PurgeEngine | null>(null);

    const running = state?.running ?? false;
    const paused = state?.paused ?? false;

    function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm(f => ({ ...f, [key]: value }));
    }

    function appendLog(entry: LogEntry) {
        setLogs(prev => {
            const next = [...prev, entry];
            return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
        });
    }

    function buildOptions(dryRun: boolean): PurgeOptions | null {
        if (!form.guildId) {
            showToast("Server ID (or @me for DMs) is required.", Toasts.Type.FAILURE);
            return null;
        }
        if (form.guildId === "@me" && !form.channelId) {
            showToast("Channel ID is required for DMs.", Toasts.Type.FAILURE);
            return null;
        }
        if (form.guildId !== "@me" && !form.channelId && !form.authorId && !form.content) {
            showToast("Provide a Channel ID, Author ID, or content filter to scope a server-wide purge.", Toasts.Type.FAILURE);
            return null;
        }
        if (form.pattern) {
            try {
                new RegExp(form.pattern, "i");
            } catch {
                showToast("Invalid regex pattern.", Toasts.Type.FAILURE);
                return null;
            }
        }

        return {
            guildId: form.guildId,
            channelId: form.channelId,
            authorId: form.authorId,
            content: form.content,
            has: form.hasFilter === "link" || form.hasFilter === "file" ? form.hasFilter : undefined,
            includeNsfw: form.includeNsfw,
            includePinned: form.includePinned,
            minId: form.minId,
            maxId: form.maxId,
            pattern: form.pattern,
            searchDelayMs: settings.store.searchDelayMs,
            deleteDelayMs: settings.store.deleteDelayMs,
            maxAttempts: 2,
            dryRun,
        };
    }

    function launch(dryRun: boolean) {
        const options = buildOptions(dryRun);
        if (!options) return;

        setLogs([]);
        const engine = createPurgeEngine(options, {
            onProgress: setState,
            onLog: appendLog,
            onStop: () => { },
        });
        engineRef.current = engine;
        engine.start();
    }

    function handleCountOnly() {
        launch(true);
    }

    function handleStart() {
        const options = buildOptions(false);
        if (!options) return;

        Alerts.show({
            title: "Start deleting messages?",
            body: (
                <>
                    <Paragraph>This will permanently delete matching messages. This cannot be undone.</Paragraph>
                    <Paragraph>Run Count only first if you haven't, to see roughly how many messages match.</Paragraph>
                </>
            ),
            confirmText: "Delete",
            cancelText: "Cancel",
            onConfirm: () => launch(false),
        });
    }

    function handlePauseResume() {
        const engine = engineRef.current;
        if (!engine) return;
        if (paused) engine.resume(); else engine.pause();
    }

    function handleStop() {
        engineRef.current?.stop();
    }

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Purge Messages"
            actions={[{ text: "Close", variant: "secondary", onClick: modalProps.onClose }]}
        >
            <div className={cl("root")}>
                <TargetRow
                    label="Server ID (@me for DMs)"
                    value={form.guildId}
                    onChange={v => patchForm("guildId", v)}
                    onUseCurrent={() => patchForm("guildId", getCurrentGuild()?.id ?? "@me")}
                />
                <TargetRow
                    label="Channel ID"
                    value={form.channelId}
                    onChange={v => patchForm("channelId", v)}
                    onUseCurrent={() => patchForm("channelId", getCurrentChannel()?.id ?? "")}
                />
                <TargetRow
                    label="Author ID"
                    value={form.authorId}
                    onChange={v => patchForm("authorId", v)}
                    onUseCurrent={() => patchForm("authorId", UserStore.getCurrentUser()?.id ?? "")}
                />

                <Field label="Content contains">
                    <TextInput value={form.content} onChange={v => patchForm("content", v)} placeholder="Optional text filter" />
                </Field>

                <Field label="Has attachment/link">
                    <Select
                        options={HAS_OPTIONS}
                        isSelected={v => v === form.hasFilter}
                        select={v => patchForm("hasFilter", v)}
                        serialize={String}
                    />
                </Field>

                <div className={cl("checkbox-row")}>
                    <Checkbox value={form.includeNsfw} onChange={(_, v) => patchForm("includeNsfw", v)}>
                        Include NSFW channels
                    </Checkbox>
                    <Checkbox value={form.includePinned} onChange={(_, v) => patchForm("includePinned", v)}>
                        Include pinned messages
                    </Checkbox>
                </div>

                <div className={cl("range-row")}>
                    <Field label="Min message ID">
                        <TextInput value={form.minId} onChange={v => patchForm("minId", v)} placeholder="Optional" />
                    </Field>
                    <Field label="Max message ID">
                        <TextInput value={form.maxId} onChange={v => patchForm("maxId", v)} placeholder="Optional" />
                    </Field>
                </div>

                <Field label="Regex pattern (matched against content)">
                    <TextInput value={form.pattern} onChange={v => patchForm("pattern", v)} placeholder="Optional" />
                </Field>

                <div className={cl("actions-row")}>
                    <Button size="small" variant="secondary" disabled={running} onClick={handleCountOnly}>Count only</Button>
                    <Button size="small" variant="dangerPrimary" disabled={running} onClick={handleStart}>Start</Button>
                    <Button size="small" variant="secondary" disabled={!running} onClick={handlePauseResume}>
                        {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button size="small" variant="secondary" disabled={!running} onClick={handleStop}>Stop</Button>
                </div>

                {state && (
                    <div className={cl("progress")}>
                        <span>Deleted: {state.deletedCount}</span>
                        <span>Failed: {state.failedCount}</span>
                        <span>Skipped: {state.skippedCount}</span>
                        <span>~Total matches: {state.grandTotal}</span>
                        <span>ETA: {formatEta(state.etaMs)}</span>
                    </div>
                )}

                <ScrollerThin className={cl("log")} fade>
                    {logs.map((entry, i) => (
                        <div key={i} className={cl("log-line", entry.level)}>
                            {new Date(entry.timestamp).toLocaleTimeString()} {entry.message}
                        </div>
                    ))}
                </ScrollerThin>
            </div>
        </Modal>
    );
}

export const PurgeModal = ErrorBoundary.wrap(PurgeModalInner, { noop: true });

export function openPurgeModal(): void {
    openModal(props => <PurgeModal modalProps={props} />);
}
