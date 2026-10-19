import type { StudioMessage } from "../protocol";
import type { FilesNow } from "./files";

export function studioMessage({ config, tokens, configProblems }: FilesNow): StudioMessage {
    const { entry, files } = tokens.toMemory();
    return JSON.parse(
        JSON.stringify({
            adapter: { name: "sugarcube", settings: config, problems: configProblems },
            entry,
            files,
        }),
    );
}
