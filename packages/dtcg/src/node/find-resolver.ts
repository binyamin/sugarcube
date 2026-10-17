import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseJson } from "../read/json.js";
import { isResolver, isResolverName } from "../read/resolver.js";

/** What {@link findResolver} found: one resolver, several, or none. */
export type FoundResolver =
    | { kind: "one"; path: string }
    | { kind: "several"; paths: string[] }
    | { kind: "none" };

/** How {@link findResolver} knows a resolver. */
export interface FindResolverOptions {
    /**
     * How a file is known to be a resolver. `"name"`: its name ends `.resolver.json`, as
     * Resolver 3.2 says resolver documents should be named; no file is opened, so the cost does
     * not grow with other JSON in the folders. `"content"`: that, or a top-level
     * `resolutionOrder` (Resolver 4.1), whatever the name, as `read` tells a resolver; every JSON
     * file in the folders is read, so give it a folder you know holds design tokens, not a whole
     * project.
     * @default "name"
     */
    by?: "name" | "content";
}

const SKIPPED = new Set(["node_modules", "dist", "build", "out"]);

const RESOLUTION_ORDER = Buffer.from('"resolutionOrder"');

/**
 * Finds the resolver among files and folders: each file given is checked, and each folder is
 * searched with everything below it, leaving out `node_modules`, `dist`, `build`, `out` and
 * hidden folders, such as `.git` or `.next`. Several are given as several, never one chosen from
 * them. Each path is the folder given joined with the file's place inside it, so it can be read
 * as it is. A path that doesn't exist throws, as reading it would.
 *
 * @example
 * const found = await findResolver(process.cwd());
 * if (found.kind === "one") await read(found.path);
 *
 * @example
 * // a folder of design tokens, whose resolver may be named anything
 * await findResolver("src/tokens", { by: "content" });
 */
export async function findResolver(
    paths: string | readonly string[],
    { by = "name" }: FindResolverOptions = {},
): Promise<FoundResolver> {
    const keep = by === "name" ? isResolverName : isJson;
    const files = (await Promise.all([paths].flat().map((path) => filesAt(path, keep)))).flat();
    const resolvers = by === "name" ? files : await withContent(files);
    const once = new Map<string, string>();
    for (const file of resolvers) {
        const where = resolve(file);
        if (!once.has(where)) once.set(where, file);
    }
    const [first, ...rest] = [...once.values()].sort();
    if (first === undefined) return { kind: "none" };
    return rest.length === 0
        ? { kind: "one", path: first }
        : { kind: "several", paths: [first, ...rest] };
}

async function filesAt(path: string, keep: (file: string) => boolean): Promise<string[]> {
    if (!(await stat(path)).isDirectory()) return keep(path) ? [path] : [];
    const found: string[] = [];
    const visit = async (folder: string): Promise<void> => {
        const nested: Promise<void>[] = [];
        for (const entry of await readdir(folder, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!skipped(entry.name)) nested.push(visit(join(folder, entry.name)));
            } else if (keep(entry.name)) {
                found.push(join(folder, entry.name));
            }
        }
        await Promise.all(nested);
    };
    await visit(path);
    return found;
}

function skipped(folder: string): boolean {
    return folder.startsWith(".") || SKIPPED.has(folder);
}

function isJson(file: string): boolean {
    return file.endsWith(".json");
}

async function withContent(files: string[]): Promise<string[]> {
    const kept = await Promise.all(
        files.map(async (file) => isResolverName(file) || writesResolutionOrder(file)),
    );
    return files.filter((_, index) => kept[index]);
}

async function writesResolutionOrder(file: string): Promise<boolean> {
    const bytes = await readFile(file);
    return (
        bytes.includes(RESOLUTION_ORDER) && isResolver(file, parseJson(bytes.toString("utf8")).root)
    );
}
