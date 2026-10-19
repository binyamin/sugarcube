import { type StoreApi, createStore } from "zustand";
import { computeDiff } from "../tokens/compute-diff";
import type { TokenDiffEntry } from "../tokens/types";
import type { SourceStoreHandle } from "./create-source-store";

export type DiffState = {
    entries: readonly TokenDiffEntry[];
    pendingPaths: ReadonlySet<string>;
};

export function pendingKey(path: string, context?: string): string {
    return context === undefined ? path : `${context}::${path}`;
}

export function pendingKeys(entries: readonly TokenDiffEntry[]): Set<string> {
    return new Set(
        entries.flatMap((entry) =>
            entry.contexts.length === 0
                ? [pendingKey(entry.path)]
                : entry.contexts.map((context) => pendingKey(entry.path, context)),
        ),
    );
}

export type DiffStoreAPI = StoreApi<DiffState>;

export type DiffStoreHandle = {
    store: DiffStoreAPI;
    activate: () => () => void;
};

export function createDiffStore(
    tokens: Pick<SourceStoreHandle, "store" | "getBaseline">,
): DiffStoreHandle {
    const recompute = (): DiffState => {
        const { resolved, index } = tokens.store.getState();
        const baseline = tokens.getBaseline();
        const entries = computeDiff({
            resolved,
            baseline,
            index,
            baselineIndex: baseline.index,
        });
        return { entries, pendingPaths: pendingKeys(entries) };
    };

    const store = createStore<DiffState>(() => recompute());

    const activate = (): (() => void) => {
        store.setState(recompute());
        return tokens.store.subscribe((state, prev) => {
            if (state.resolved !== prev.resolved || state.ops !== prev.ops) {
                store.setState(recompute());
            }
        });
    };

    return { store, activate };
}
