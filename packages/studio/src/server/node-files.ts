import { type LoadedConfig, tokensOnDisk } from "@sugarcube-sh/core";
import { type FileWatcher, liveTokens } from "@sugarcube-sh/dtcg/node";
import { type StudioFiles, studioFiles } from "./files";

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
        ...studioFiles(
            () => ({ config, tokens, configProblems: [] }),
            (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        ),
        watch: (watcher) => live.watch(watcher),
    };
}
