import { useState } from "react";
import { moved, without } from "../controllers/value-field";

export function useDraft<D>(
    fresh: D,
    shown: string,
    keeps: (draft: D) => boolean = () => false,
): [D, (next: D) => void] {
    const [draft, setDraft] = useState(fresh);
    const [was, setWas] = useState(shown);
    if (was !== shown) {
        setWas(shown);
        if (!keeps(draft)) setDraft(fresh);
    }
    return [draft, setDraft];
}

export interface ItemKeys {
    readonly keys: readonly number[];
    added(): void;
    removed(at: number): void;
    moved(from: number, to: number): void;
}

export function useItemKeys(count: number): ItemKeys {
    const [keys, setKeys] = useState<readonly number[]>(() => newKeys(count));
    if (keys.length !== count) setKeys(newKeys(count));
    return {
        keys,
        added: () => setKeys([...keys, ...newKeys(1)]),
        removed: (at) => setKeys(without(keys, at)),
        moved: (from, to) => setKeys(moved(keys, from, to)),
    };
}

let lastKey = 0;

function newKeys(count: number): number[] {
    return Array.from({ length: count }, () => {
        lastKey += 1;
        return lastKey;
    });
}
