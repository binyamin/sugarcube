// Watch mode. It watches every file the tokens were read from, the resolver included, and reads
// again when one changes. A file newly added to the resolver is watched from then on.
import { fileOnDisk, read } from "@sugarcube-sh/dtcg/node";

declare function watchFiles(onChange: () => void): { set(files: string[]): void };

const entry = "tokens/tokens.resolver.json";
let tokens = await read(entry);
const onDisk = () => tokens.files.map((file) => fileOnDisk(entry, file));

const watcher = watchFiles(async () => {
    tokens = await read(entry);
    watcher.set(onDisk());
});
watcher.set(onDisk());
