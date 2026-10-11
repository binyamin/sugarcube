import type { Change, Input, JsonPath, Move, Project, TokenType } from "@sugarcube-sh/dtcg";

/**
 * A replacement of some text in a file. The offset and length count UTF-16 code units, as a
 * `Span` in `@sugarcube-sh/dtcg` does.
 */
export interface TextEdit {
    file: string;
    offset: number;
    length: number;
    text: string;
}

/** A change that would mend a diagnostic, as {@link fixesFor} offers it. */
export interface Fix {
    /** What the fix does, for a menu or a prompt, such as "use `color.brand`, which has a similar name". */
    title: string;
    /**
     * Whether it can be applied without a person checking it. A safe fix, applied, leaves the place
     * it mends reading clean and changes nothing else the files mean; one that is not safe is a
     * likely guess a person should confirm.
     */
    safe: boolean;
    edits: TextEdit[];
}

export { fixesFor } from "./fixes.js";

/** Any JSON value. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * One change to one file, addressed by path so it still applies if the file has changed
 * elsewhere since it was read.
 *
 * - `set` changes something that exists. Its parent must exist.
 * - `add` adds something new, creating any missing groups on the way. It must not already exist.
 * - `remove` removes something. Nothing happens if it is already gone.
 * - `renameKey` renames a key, keeping its value and position. Nothing happens if a sibling
 *   already has the new name and holds `was`.
 * - `createFile` creates a file holding `value`. It must not already exist.
 * - `deleteFile` deletes a file.
 *
 * `set`, `remove` and `deleteFile` record `was`, what they expect to find. If that has changed by
 * the time the edit is applied, the edit is a conflict rather than written over the change,
 * unless what it would write is already there. `renameKey` records `was`, the value at the key,
 * only to tell when the rename is already done: the key is renamed whatever its value now.
 */
export type FileOp =
    | { kind: "set"; file: string; path: JsonPath; value: Json; was: Json }
    | { kind: "add"; file: string; path: JsonPath; value: Json }
    | { kind: "remove"; file: string; path: JsonPath; was: Json }
    | { kind: "renameKey"; file: string; path: JsonPath; name: string; was: Json }
    | { kind: "createFile"; file: string; value: Json }
    | { kind: "deleteFile"; file: string; was: string };

/**
 * A question an operation cannot answer from the files alone. Answer it by calling the same
 * operation again with the answer.
 *
 * - `placement`: several files could hold the change. Answer with `{ place }`.
 * - `generated`: the token is made by a generator, from the setting on the group at `from`. Answer
 *   with {@link detach}.
 * - `inherited`: the token comes from another group. Answer with `{ inherited: "here" | "original" }`.
 *
 * `path` is the token the question is about, which matters when one operation changes several.
 */
export type Decision =
    | { kind: "placement"; path: string; candidates: string[] }
    | { kind: "generated"; path: string; from: string }
    | { kind: "inherited"; path: string; from: string; alsoAffects: string[] };

/** What an operation returns: the edits, a question, or a refusal with its reason. */
export type OpResult =
    | {
          ops: FileOp[];
          /**
           * The permutations, other than the one edited, where the change shows, by their input.
           * Only permutations the read built are listed, so a read limited by `inputs` lists only
           * those.
           */
          alsoAffects: Input[];
          /** References left pointing at nothing, after a {@link remove}. */
          broken?: string[];
          /** Tokens and groups whose path changed, such as after a {@link rename}. Empty when none did. */
          moved: Move[];
      }
    | { decision: Decision }
    | { refused: Refusal };

/**
 * Why an operation can't be done: a `kind`, the facts it is about, and a `reason` worded from
 * them, so a tool can show the reason or word its own from the facts.
 *
 * - `not-found`: no token or group at `path`.
 * - `not-a-group`: `path` is a token, so nothing can be made inside it.
 * - `taken`: a token or group is already at `path`.
 * - `override-instead`: the token at `path` is shared, so `context` gets its own value by
 *   changing it for that context ({@link setValue}), not by making it again.
 * - `invalid-name`: `name` can't be a name: `character` is the one the spec forbids (Format
 *   5.1.1), and an empty name has none, since no path reaches it.
 * - `generated`: a generator makes the token, from the extension at `extension` on the group at
 *   `from` (`""` for the top level of a file).
 * - `inherited`: the token or group comes from the group at `from`, through `$extends`.
 * - `no-permutation`: there is no permutation for `context`; `why` says whether a modifier or
 *   context isn't declared, a modifier with no default was left out, or the read didn't build it.
 * - `several-contexts`: `context` names more than one context away from its default; no file is
 *   read by that combination alone.
 * - `no-file-for-context`: `context` reads no whole file of its own to hold the edit.
 * - `no-shared-file`: no whole file every permutation reads can hold the edit.
 * - `hidden-by-later-file`: an override for `context` would be hidden by `file`, read after it.
 * - `no-shared-value`: no file every permutation reads writes the token; only contexts do.
 */
export type Refusal = { reason: string } & (
    | { kind: "not-found"; path: string }
    | { kind: "not-a-group"; path: string }
    | { kind: "taken"; path: string }
    | { kind: "override-instead"; path: string; context: Input }
    | { kind: "invalid-name"; name: string; character?: "$" | "." | "{" | "}" }
    | { kind: "generated"; path: string; from: string; extension: [string, ...string[]] }
    | { kind: "inherited"; path: string; from: string }
    | {
          kind: "no-permutation";
          context: Input;
          why: "unknown-modifier" | "unknown-context" | "no-default" | "not-read";
      }
    | { kind: "several-contexts"; context: Input }
    | { kind: "no-file-for-context"; path: string; context: Input }
    | { kind: "no-shared-file"; path: string }
    | { kind: "hidden-by-later-file"; path: string; context: Input; file: string }
    | { kind: "no-shared-value"; path: string }
);

/** Where an edit goes. */
export interface Where {
    /**
     * The context the edit is for, such as `{ theme: "dark" }`. Modifiers at their default are
     * ignored, so a permutation's full input can be passed as it is. Naming two non-default
     * contexts is refused: no file is read only by that combination.
     * @default the base value, which every permutation shares
     */
    context?: Input;
    /** The answer to a `"placement"` question. */
    place?: string;
}

/** A new token, as it will be written into the file. */
export interface NewToken {
    /**
     * Its type. Leave it out when the group declares one, or when the value is a reference: the
     * token then takes its type from there, as the spec allows. Written as given either way: when
     * no type can be worked out, the read reports it.
     */
    $type?: TokenType;
    /** Written exactly as given. */
    $value: Json;
    $description?: string;
}

/**
 * Renames a token or group, and updates every reference to it: `{…}` references, `$extends`,
 * `$ref` pointers, and fragments in the resolver.
 */
export function rename(project: Project, path: string, newName: string): OpResult {
    throw new Error("not implemented yet");
}

export { setDescription, setValue } from "./set-value.js";

/** How a value change is made: where it goes, and which part of the value it changes. */
export interface ValueOptions extends Where {
    /** A part of a composite value to change on its own, such as `["color"]` of a shadow. */
    part?: JsonPath;
    /** The answer to an `"inherited"` question. */
    inherited?: "here" | "original";
}

/**
 * Changes several values in one step, checked with one read, so a change that spans many tokens,
 * such as switching a palette, is accepted or refused as a whole. Each value follows the rules of
 * {@link setValue}.
 *
 * @example
 * setValues(project, [
 *   { path: "color.button.background", value: "{color.violet.500}" },
 *   { path: "color.button.background", value: "{color.violet.300}", context: { theme: "dark" } },
 * ])
 */
export function setValues(
    project: Project,
    values: ({ path: string; value: Json } & ValueOptions)[],
): OpResult {
    throw new Error("not implemented yet");
}

export { create } from "./create.js";

/** Moves a token or group among its siblings. */
export function reorder(
    project: Project,
    path: string,
    options: { after: string } | { before: string },
): OpResult {
    throw new Error("not implemented yet");
}

/**
 * Moves a token or group to another group, another file, or both, and gives it a new name if
 * `name` is set. Refused when the new file is read by different contexts than the old one, since
 * the token would disappear from some of them.
 *
 * @example
 * move(project, "color.brand.500", { group: "color.primary", name: "600" })
 */
export function move(
    project: Project,
    path: string,
    to: { group?: string; file?: string; name?: string },
): OpResult {
    throw new Error("not implemented yet");
}

export { remove } from "./remove.js";

/**
 * Marks a token or group as deprecated, with a message saying what to use instead, or `true` for
 * none. `null` removes the mark.
 *
 * @example
 * deprecate(project, "color.old", "Use color.primary instead")
 */
export function deprecate(project: Project, path: string, reason: string | true | null): OpResult {
    throw new Error("not implemented yet");
}

/**
 * Changes one setting inside a token's or group's `$extensions`, leaving the rest as written, so
 * other tools' settings are never touched. `at` starts with the extension's key; give only the
 * key to replace the whole extension. `null` removes the setting.
 *
 * @example
 * setExtension(project, "space", ["com.example", "scale", "ratio"], 1.333)
 */
export function setExtension(
    project: Project,
    path: string,
    at: JsonPath,
    value: Json | null,
): OpResult {
    throw new Error("not implemented yet");
}

/**
 * Turns fixes offered for this project's diagnostics into ordinary edits, so they can be undone,
 * saved and replayed like any other. Pass several to make them one step. Every fix must come from
 * {@link fixesFor} for this project.
 *
 * @example
 * const safe = project.doc.diagnostics.flatMap((d) => fixesFor(project, d).filter((f) => f.safe));
 * commit(project, fix(project, safe));
 */
export function fix(project: Project, fixes: Fix[]): OpResult {
    throw new Error("not implemented yet");
}

/** Changes a token's type. Refused if tokens that refer to it would break. */
export function retype(project: Project, path: string, type: TokenType): OpResult {
    throw new Error("not implemented yet");
}

/** Turns a token made by a generator into an ordinary token written in the file. */
export function detach(project: Project, path: string): OpResult {
    throw new Error("not implemented yet");
}

/** Adds a file to a set or to a modifier's context in the resolver. */
export function addFile(
    project: Project,
    file: string,
    options: {
        to: { set: string } | { modifier: string; context: string };
        /**
         * The source to place it after.
         * @default the end
         */
        after?: string;
    },
): OpResult {
    throw new Error("not implemented yet");
}

/**
 * Adds a context to a modifier, with a new file of its own.
 *
 * @example
 * addContext(project, "theme", "dim", { file: "dim.json", basedOn: "dark" })
 */
export function addContext(
    project: Project,
    modifier: string,
    context: string,
    options: {
        file: string;
        /** An existing context to build on: its files come first. */
        basedOn?: string;
    },
): OpResult {
    throw new Error("not implemented yet");
}

/** Adds a modifier to the resolver. */
export function addModifier(
    project: Project,
    modifier: string,
    options: { contexts: string[]; default?: string },
): OpResult {
    throw new Error("not implemented yet");
}

/** Renames a modifier's context. */
export function renameContext(
    project: Project,
    modifier: string,
    from: string,
    to: string,
): OpResult {
    throw new Error("not implemented yet");
}

/**
 * Removes a modifier's context. Its files are left on disk unless `deleteFiles` is set, because
 * deleting a file should be the person's choice. Only files no other context or set reads are
 * deleted.
 */
export function removeContext(
    project: Project,
    modifier: string,
    context: string,
    options?: {
        /** @default false */
        deleteFiles?: boolean;
    },
): OpResult {
    throw new Error("not implemented yet");
}

/** Sets a modifier's default context. */
export function setDefault(project: Project, modifier: string, context: string): OpResult {
    throw new Error("not implemented yet");
}

/**
 * An edit that could no longer be made, such as a change to a token someone has since deleted,
 * with a `reason` worded from its `kind` and the edit.
 *
 * - `not-in-project`: the project doesn't hold the edit's file.
 * - `gone`: the place the edit changes is no longer there.
 * - `changed`: what is there is no longer what the edit expected (`was`).
 * - `taken`: something different is already where the edit would write, or a sibling already
 *   has the new name.
 * - `not-a-group`: the path runs through something that isn't a group, or past the end of a list.
 * - `unread`: nothing in the project would read the new file, so it would be lost.
 */
export interface Conflict {
    op: FileOp;
    kind: "not-in-project" | "gone" | "changed" | "taken" | "not-a-group" | "unread";
    reason: string;
}

export { apply, commit } from "./apply.js";

/** The outcome of {@link commit}. */
export type Committed =
    | {
          project: Project;
          /** The edits that were applied, for undo, saving, and sharing. */
          ops: FileOp[];
          /** Tokens and groups whose path changed, for keeping a selection or a URL on them. */
          moved: Move[];
      }
    | { decision: Decision }
    | { refused: Refusal }
    | { conflicts: Conflict[] };

/** Edits, with the moves they made, as they are kept for undo and saved for later. */
export interface Edits {
    ops: FileOp[];
    moved: Move[];
}

/**
 * The files that differ between two projects: each one's new text, or `null` where the file was
 * deleted. For saving somewhere that takes whole files, such as a pull request.
 */
export function changedFiles(before: Project, after: Project): Record<string, string | null> {
    throw new Error("not implemented yet");
}

/** Encodes edits and their moves as a compact string, for URLs and saved sessions. */
export function encodeEdits(edits: Edits): Promise<string> {
    throw new Error("not implemented yet");
}

/** Decodes edits encoded with {@link encodeEdits}. */
export function decodeEdits(text: string): Promise<Edits> {
    throw new Error("not implemented yet");
}

/**
 * An editing session: a project as a person edits it, with undo, the unsaved edits, and what
 * changed since it was opened. It changes as it is used, like a store; the projects inside it
 * never do. Writing is left to the tool: send {@link Session.unsaved} wherever saves go, then call
 * {@link Session.saved}.
 *
 * @example
 * const session = createSession(project);
 * session.do(rename(session.project, "color.brand", "primary"));
 * session.undo();
 */
export interface Session {
    /** The current version. */
    readonly project: Project;
    /** The version the unsaved edits are measured from: as opened, as last saved, or as last adopted. */
    readonly opened: Project;
    /** The edits since {@link Session.opened}, with the moves they made: what a save sends, and what to keep for a reload. */
    readonly unsaved: Edits;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /**
     * Commits an operation's result. On success the project moves on and the change goes on the
     * undo history; otherwise nothing changes, and the answer says why.
     */
    do(result: OpResult): Committed;
    /** Commits an operation's result without keeping it, for previewing, such as while a slider moves. */
    preview(result: OpResult): Committed;
    undo(): void;
    redo(): void;
    /** What changed since {@link Session.opened}, renames included. */
    changes(): Change[];
    /**
     * Records that the unsaved edits were saved: the current version becomes
     * {@link Session.opened}. Undo still works; undoing past a save makes unsaved edits that
     * revert it.
     */
    saved(): void;
    /** Goes back to {@link Session.opened} and drops the unsaved edits. The undo history starts again. */
    discard(): void;
    /**
     * Puts back unsaved edits kept from before a reload, on top of the current version. Returns the
     * edits that no longer apply; if there are any, nothing changes.
     */
    restore(unsaved: Edits): Conflict[];
    /**
     * Takes in files that changed underneath the session, such as after a `git pull`: the unsaved
     * edits are put back on top of `fresh`, which becomes {@link Session.opened}, and the undo
     * history starts again. Returns the edits that no longer apply; if there are any, nothing
     * changes.
     */
    adopt(fresh: Project): Conflict[];
    /** Calls `listener` whenever the session changes. Returns a function that stops listening. */
    subscribe(listener: () => void): () => void;
}

/** Starts an editing session on a project. */
export function createSession(project: Project): Session {
    throw new Error("not implemented yet");
}
