import type { Project, ReadOptions } from "../index.js";
import { type FileStats, onFileChanged } from "./file-changed.js";
import { open } from "./open.js";
import { diskPath, fileOnDisk } from "./paths.js";

/** What to open, as for `open`: a resolver or a token file, and how. */
export interface ProjectSource {
    entry: string;
    options?: ReadOptions;
}

/**
 * Why a read happened and how long it took: the file whose save led to it, by the design system's
 * name for it, as in `DesignSystem.files`, and none for {@link LiveProject.reread}.
 */
export interface ReadEvent {
    file?: string;
    ms: number;
}

/**
 * Something that watches files and says when one is saved, added or deleted, with its path. A
 * chokidar watcher and Vite's `server.watcher` are both one.
 */
export interface FileWatcher {
    add(paths: string | readonly string[]): unknown;
    on(
        event: "change" | "add" | "unlink",
        listener: (path: string, stats?: FileStats) => void,
    ): unknown;
}

/**
 * A project kept current with its files: the design system and the text it was read from. Made by
 * {@link liveProject}.
 */
export interface LiveProject {
    /**
     * The project as last read, once any read in progress or waiting to start has finished.
     * Rejects when that read failed.
     *
     * @example
     * const { doc, files } = await live.project();
     */
    project(): Promise<Project>;
    /**
     * Calls `listener` with each project read after the first, and the {@link ReadEvent} that
     * led to it. A read is not passed on when another is already waiting to start, so a listener
     * never builds on a project that a save or {@link LiveProject.reread} has outdated. Returns a
     * function that stops it.
     *
     * @example
     * const stop = live.onRead(({ doc }, { file, ms }) => console.log(file, ms, doc.diagnostics.length));
     */
    onRead(listener: (project: Project, event: ReadEvent) => void): () => void;
    /**
     * Reads again, asking the source again when it was given as a function, such as after a
     * config naming the entry has changed. Resolves once the read has finished: its project
     * goes to the listeners, and a failure to `onError`, as for a save.
     *
     * @example
     * await live.reread();
     */
    reread(): Promise<void>;
    /**
     * Adds the files the design system lists to `watcher`, and each file a later read gains, and
     * reads again when one of them is saved, added or deleted. Files are never removed from it: an
     * event for a file the latest design system does not list is ignored. Its files are added once
     * the first read has finished, so a host waiting for its watcher to be ready awaits
     * {@link LiveProject.project} first.
     *
     * @example
     * live.watch(chokidar.watch([], { ignoreInitial: true }));
     */
    watch(watcher: FileWatcher): void;
}

/**
 * Opens a design system from disk and keeps it, and the text of its files, current together, for a
 * host that runs for a while, such as a dev server, a watch command or an editor. It reads at once;
 * once given a watcher, it reads again when a file the design system lists is saved, added or
 * deleted. Saves during a read lead to one more read, a file a read gains that was saved during it
 * is read again, and so is a save whose last write the watcher never reported
 * ({@link onFileChanged}).
 *
 * What a listener throws, and a read that fails, go to `onError`, never into the watcher's event.
 *
 * @param source What to read. Give a function to be asked again on every read.
 *
 * @example
 * const live = liveProject({ entry: "tokens/tokens.resolver.json" }, { onError: console.error });
 * live.watch(watcher);
 * live.onRead(({ doc }, { file }) => console.log(`${file} saved`, doc.diagnostics.length));
 */
export function liveProject(
    source: ProjectSource | (() => ProjectSource),
    { onError }: { onError: (error: unknown) => void },
): LiveProject {
    const listeners = new Set<(project: Project, event: ReadEvent) => void>();
    let names = new Map<string, string>();
    let watcher: FileWatcher | undefined;
    const watched = new Set<string>();
    let reading = false;
    let savedDuringRead = new Set<string>();
    let queued: Promise<Project> | undefined;
    let queuedFile: string | undefined;

    const watchNewFiles = () => {
        if (!watcher) return;
        const added = [...names.keys()].filter((path) => !watched.has(path));
        for (const path of added) watched.add(path);
        if (added.length > 0) watcher.add(added);
    };

    const readOnce = async (): Promise<Project> => {
        reading = true;
        savedDuringRead = new Set();
        try {
            const { entry, options } = typeof source === "function" ? source() : source;
            const opened = await open(entry, options);
            names = new Map(opened.doc.files.map((file) => [fileOnDisk(entry, file), file]));
            watchNewFiles();
            return opened;
        } finally {
            reading = false;
            const missed = [...savedDuringRead].find((path) => names.has(path));
            if (missed !== undefined) readAgain(names.get(missed));
        }
    };

    const readAndTell = async (file?: string): Promise<Project> => {
        const started = performance.now();
        const opened = await readOnce();
        const ms = performance.now() - started;
        if (queued) return opened;
        const event: ReadEvent = file === undefined ? { ms } : { file, ms };
        for (const listener of listeners) {
            try {
                listener(opened, event);
            } catch (error) {
                onError(error);
            }
        }
        return opened;
    };

    let latest = readOnce();
    latest.catch(onError);

    function readAgain(file?: string): Promise<Project> {
        queuedFile = file;
        if (queued) return queued;
        const start = () => {
            queued = undefined;
            return readAndTell(queuedFile);
        };
        queued = latest.then(start, start);
        latest = queued;
        latest.catch(onError);
        return latest;
    }

    const changed = (path: string) => {
        const disk = diskPath(path);
        const file = names.get(disk);
        if (file !== undefined) readAgain(file);
        else if (reading) savedDuringRead.add(disk);
    };

    return {
        project: () => latest,
        onRead(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        reread: () =>
            readAgain().then(
                () => undefined,
                () => undefined,
            ),
        watch(given) {
            watcher = given;
            onFileChanged(given, changed);
            given.on("add", changed);
            given.on("unlink", changed);
            watchNewFiles();
        },
    };
}
