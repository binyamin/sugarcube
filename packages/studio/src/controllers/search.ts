import { cssValue } from "@sugarcube-sh/dtcg/css";
import type { Studio, StudioState } from "./studio";

export const MAX_HITS = 40;

export interface Hit {
    readonly path: string;
    readonly swatch: string | undefined;
    readonly value: string | undefined;
}

export interface SearchState {
    readonly query: string;
    readonly hits: readonly Hit[];
    readonly capped: boolean;
}

export interface Search {
    readonly state: SearchState;
    subscribe(listener: () => void): () => void;
    destroy(): void;
    setQuery(query: string): void;
}

export function createSearch(studio: Studio): Search {
    const listeners = new Set<() => void>();
    let state = found(studio.state, "");

    function publish(next: SearchState) {
        state = next;
        for (const listener of listeners) listener();
    }

    const stopStudio = studio.subscribe(() => publish(found(studio.state, state.query)));

    return {
        get state() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        destroy() {
            stopStudio();
            listeners.clear();
        },
        setQuery(query) {
            publish(found(studio.state, query));
        },
    };
}

function found({ tokens, showing }: StudioState, query: string): SearchState {
    const needle = query.trim().toLowerCase();
    const hits: Hit[] = [];
    if (!needle) return { query, hits, capped: false };

    for (const path of tokens.tokenPaths()) {
        if (!path.toLowerCase().includes(needle)) continue;
        if (hits.length === MAX_HITS) return { query, hits, capped: true };
        const token = showing.token(path);
        const css = token && cssValue(token);
        const value = typeof css === "string" ? css : undefined;
        hits.push({ path, swatch: token?.type === "color" ? value : undefined, value });
    }
    return { query, hits, capped: false };
}
