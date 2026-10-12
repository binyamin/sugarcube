import { type Document, type Move, type Project, diff, movedPath } from "@sugarcube-sh/dtcg";
import { applyWhatFits, commit } from "./apply.js";
import { clashesOf } from "./clashes.js";
import type { Committed, Edits, OpResult, Session } from "./index.js";

/**
 * Starts an editing session on a project.
 *
 * @example
 * const session = createSession(project);
 * session.do(setValue(session.project, "color.brand", "#e11d48"));
 * await save(session.unsaved);
 * session.saved();
 */
export function createSession(project: Project): Session {
    let current = project;
    let opened = project;
    let unsaved: Edits = { ops: [], moved: [] };
    const counter = { made: 0 };
    let ids = followed(undefined, [], project.doc, counter);
    let openedIds = ids;
    const listeners = new Set<() => void>();
    const changed = () => {
        for (const listener of listeners) listener();
    };

    return {
        get project() {
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
            if (!("project" in done)) return done;
            current = done.project;
            unsaved = {
                ops: [...unsaved.ops, ...done.ops],
                moved: [...unsaved.moved, ...done.moved],
            };
            ids = followed(ids, done.moved, current.doc, counter);
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
            return diff(opened.doc, current.doc, { moved: unsaved.moved });
        },
        saved() {
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
            const { project: next, applied, skipped } = applyWhatFits(current, edits.ops);
            const clashes = clashesOf(skipped, current, next);
            if (applied.length === 0) return clashes;
            current = next;
            unsaved = {
                ops: [...unsaved.ops, ...applied],
                moved: [...unsaved.moved, ...edits.moved],
            };
            ids = followed(ids, edits.moved, current.doc, counter);
            changed();
            return clashes;
        },
        adopt(fresh) {
            const { project: next, applied, skipped } = applyWhatFits(fresh, unsaved.ops);
            const clashes = clashesOf(skipped, fresh, next);
            openedIds = followed(openedIds, [], fresh.doc, counter);
            ids = followed(ids, [], next.doc, counter, openedIds);
            opened = fresh;
            current = next;
            unsaved = { ops: applied, moved: unsaved.moved };
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
    doc: Document,
    counter: { made: number },
    known?: Ids,
): Ids {
    const paths = pathsIn(doc);
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

function pathsIn(doc: Document): Set<string> {
    return new Set(
        doc.permutations.flatMap((permutation) => [
            ...permutation.groups.map(({ path }) => path),
            ...permutation.tokens.map(({ path }) => path),
        ]),
    );
}
