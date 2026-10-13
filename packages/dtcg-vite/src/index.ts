import { type LiveProject, type ProjectSource, liveProject } from "@sugarcube-sh/dtcg/node";
import type { Logger, Plugin } from "vite";

/**
 * The design tokens the plugin keeps current, and the text of their files, for the plugins after
 * it: a {@link LiveProject} that Vite's own watcher drives.
 */
export type DtcgApi = Omit<LiveProject, "watch">;

/** The plugin, with its {@link DtcgApi} as `api`. */
export interface DtcgPlugin extends Plugin {
    api: DtcgApi;
}

/**
 * Opens design tokens with `dtcg` and keeps them current on Vite's watcher: it watches exactly
 * the files the design tokens list and reads again when one is saved, added or deleted. Give the
 * source as a function to be asked again on every read. What fails is logged through Vite.
 *
 * @example
 * // vite.config.ts
 * export default { plugins: [dtcg({ entry: "tokens/tokens.resolver.json" })] };
 */
export default function dtcg(source: ProjectSource | (() => ProjectSource)): DtcgPlugin {
    let logger: Logger | undefined;
    const early: unknown[] = [];
    const log = (error: unknown) =>
        logger?.error(`[dtcg] ${error instanceof Error ? error.message : String(error)}`);
    const live = liveProject(source, {
        onError: (error) => (logger ? log(error) : early.push(error)),
    });

    return {
        name: "dtcg",
        api: { project: live.project, onRead: live.onRead, reread: live.reread },
        configResolved(config) {
            logger = config.logger;
            for (const error of early.splice(0)) log(error);
        },
        configureServer(server) {
            live.watch(server.watcher);
        },
    };
}

export type { ProjectSource, ReadEvent } from "@sugarcube-sh/dtcg/node";
