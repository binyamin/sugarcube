import { createContext, useContext, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { useHost } from "../host/host-provider";
import type { PathIndex } from "../tokens/path-index";
import type { TokenDiffEntry, TokenSnapshot } from "../tokens/types";
import type { DiffState, DiffStoreAPI } from "./create-diff-store";
import type { TokenStoreAPI, TokenStoreState } from "./create-source-store";

export type StudioContextValue = {
    store: TokenStoreAPI;
    diffStore: DiffStoreAPI;
};

export const StudioContext = createContext<StudioContextValue | null>(null);

function useStudio(): StudioContextValue {
    const ctx = useContext(StudioContext);
    if (!ctx) throw new Error("Studio hooks must be used inside a StudioProvider");
    return ctx;
}

export function usePathIndex(): PathIndex {
    return useTokenStore((state) => state.index);
}

export function useBaseline(): TokenSnapshot {
    const host = useHost();
    return useSyncExternalStore(host.baseline.subscribe, host.baseline.getState);
}

export function useTokenStore<T>(selector: (state: TokenStoreState) => T): T {
    return useStore(useStudio().store, selector);
}

function useDiffStore<T>(selector: (state: DiffState) => T): T {
    return useStore(useStudio().diffStore, selector);
}

export function useCurrentContext(): string {
    return useTokenStore((state) => state.currentContext);
}

export function useSetCurrentContext(): (ctx: string) => void {
    return useTokenStore((state) => state.setCurrentContext);
}

export function useConflicts(): readonly string[] {
    return useTokenStore((state) => state.conflicts);
}

export function usePendingChanges(): readonly TokenDiffEntry[] {
    return useDiffStore((state) => state.entries);
}

export function usePendingChangesCount(): number {
    return useDiffStore((state) => state.entries.length);
}

export function useHasPendingChanges(): boolean {
    return useDiffStore((state) => state.entries.length > 0);
}

export function useDiscard(): () => void {
    return useTokenStore((s) => s.discard);
}
