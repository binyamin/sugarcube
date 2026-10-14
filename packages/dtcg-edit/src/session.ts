import { type DesignTokens, type Move, movedPath } from "@sugarcube-sh/dtcg";
import { applyWhatFits, commit } from "./apply.js";
import { clashesOf } from "./clashes.js";
import type { Committed, Edits, OpResult, Session } from "./index.js";

/**
 * Starts an editing session on design tokens.
 *
 * @example
 * const session = createSession(tokens);
 * session.do(setValue(session.tokens, "color.brand", "#e11d48"));
 * await save(session.unsaved);
 * session.markSaved();
 */
export function createSession(tokens: DesignTokens): Session {
    let current = tokens;
    let opened = tokens;
    let unsaved: Edits = { ops: [], moved: [] };
    const counter = { made: 0 };
    let ids = followed(undefined, [], tokens, counter);
    let openedIds = ids;
    const listeners = new Set<() => void>();
    const changed = () => {
        for (const listener of listeners) listener();
    };

    return {
        get tokens() {
            return current;
        },
        get opened() {
            return opened;
        },
        get unsaved() {
            return unsaved;
        },
        canUndo: false,
        canRedo: false,
        do(result: OpResult): Committed {
            const done = commit(current, result);
            if (!("tokens" in done)) return done;
            current = done.tokens;
            unsaved = {
                ops: [...unsaved.ops, ...done.ops],
                moved: [...unsaved.moved, ...done.moved],
            };
            ids = followed(ids, done.moved, current, counter);
            changed();
            return done;
        },
        preview() {
            throw new Error("not implemented yet");
        },
        undo() {
            throw new Error("not implemented yet");
        },
        redo() {
            throw new Error("not implemented yet");
        },
        changes() {
            return current.diff(opened, { moved: unsaved.moved });
        },
        markSaved() {
            opened = current;
            unsaved = { ops: [], moved: [] };
            openedIds = ids;
            changed();
        },
        discard() {
            current = opened;
            unsaved = { ops: [], moved: [] };
            ids = openedIds;
            changed();
        },
        restore(edits) {
            const { tokens: next, applied, skipped } = applyWhatFits(current, edits.ops);
            const clashes = clashesOf(skipped, current, next);
            if (applied.length === 0) return clashes;
            const moved = kept(edits.moved, next);
            current = next;
            unsaved = { ops: [...unsaved.ops, ...applied], moved: [...unsaved.moved, ...moved] };
            ids = followed(ids, moved, current, counter);
            changed();
            return clashes;
        },
        rebase(fresh) {
            const { tokens: next, applied, skipped } = applyWhatFits(fresh, unsaved.ops);
            const clashes = clashesOf(skipped, fresh, next, [current, opened]);
            openedIds = followed(openedIds, [], fresh, counter);
            ids = followed(ids, [], next, counter, openedIds);
            opened = fresh;
            current = next;
            unsaved = { ops: applied, moved: kept(unsaved.moved, next) };
            changed();
            return clashes;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        idOf(path) {
            return ids.byPath.get(path);
        },
        pathOf(id) {
            return ids.byId.get(id);
        },
    };
}

interface Ids {
    byId: ReadonlyMap<string, string>;
    byPath: ReadonlyMap<string, string>;
}

function followed(
    ids: Ids | undefined,
    moved: Move[],
    tokens: DesignTokens,
    counter: { made: number },
    known?: Ids,
): Ids {
    const paths = pathsIn(tokens);
    const byId = new Map<string, string>();
    const byPath = new Map<string, string>();
    const set = (id: string, path: string) => {
        byId.set(id, path);
        byPath.set(path, id);
    };
    const from = ids?.byId ?? new Map([...paths].map((path) => [path, path]));
    for (const [id, path] of from) {
        const now = movedPath(path, moved);
        if (paths.has(now)) set(id, now);
    }
    const taken = (id: string) => byId.has(id) || (known?.byId.has(id) ?? false);
    for (const path of paths) {
        if (byPath.has(path)) continue;
        const hint = known?.byPath.get(path);
        if (hint !== undefined && !byId.has(hint)) {
            set(hint, path);
            continue;
        }
        let id: string;
        do id = `new:${++counter.made}`;
        while (taken(id));
        set(id, path);
    }
    return { byId, byPath };
}

function kept(moved: Move[], tokens: DesignTokens): Move[] {
    const paths = pathsIn(tokens);
    const later: Move[] = [];
    for (let index = moved.length - 1; index >= 0; index--) {
        const move = moved[index];
        if (move && paths.has(movedPath(move.to, later))) later.unshift(move);
    }
    return later;
}

function pathsIn(tokens: DesignTokens): Set<string> {
    return new Set([...tokens.groupPaths(), ...tokens.tokenPaths()]);
}
