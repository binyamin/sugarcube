import {
    type LoadedConfig,
    loadInternalConfig,
    problemsText,
    tokensOnDisk,
} from "@sugarcube-sh/core";
import { type FileWatcher, liveTokens } from "@sugarcube-sh/dtcg/node";
import { ErrorMessages } from "../error-messages";
import type { StudioFiles } from "./files";

export async function nodeFiles(
    config: LoadedConfig["config"],
    { onError }: { onError: (error: unknown) => void },
): Promise<StudioFiles & { watch(watcher: FileWatcher): void }> {
    const live = liveTokens(tokensOnDisk(config), { onError });
    let tokens = await live.tokens();
    const listeners = new Set<() => void>();
    live.onRead((next) => {
        tokens = next;
        for (const listener of listeners) listener();
    });

    return {
        now: () => ({ config, tokens, configProblems: [] }),
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        watch: (watcher) => live.watch(watcher),
    };
}

export async function projectFiles(): ReturnType<typeof nodeFiles> {
    const { config } = await loadInternalConfig();
    return nodeFiles(config, {
        onError: (error) => console.error(ErrorMessages.READ_FAILED, error),
    });
}

export function refuseEmpty(files: StudioFiles): void {
    const { config, tokens } = files.now();
    if (tokens.tokenPaths().length > 0) return;
    const where = { cwd: process.cwd(), entry: config.resolver };
    throw new Error(ErrorMessages.NOTHING_TO_BUILD(problemsText(tokens.diagnostics, where)));
}
