// Watch mode. It watches every file the tokens were read from, the resolver included, and reads
// again when one changes. A file newly added to the resolver is watched from then on.
import { read } from "@sugarcube-sh/dtcg/node";
import { dirname, join } from "node:path";

declare function watchFiles(onChange: () => void): { set(files: string[]): void };

const entry = "tokens/tokens.resolver.json";
const onDisk = (files: string[]) => files.map((file) => join(dirname(entry), file));

let tokens = await read(entry);
const watcher = watchFiles(async () => {
    tokens = await read(entry);
    watcher.set(onDisk(tokens.files));
});
watcher.set(onDisk(tokens.files));
