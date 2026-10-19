import { fileURLToPath } from "node:url";
import { devframeViteBridge } from "@devframes/vite/single";
import { fillDefaults } from "@sugarcube-sh/core";
import type { Plugin } from "vite";
import { ErrorMessages } from "../error-messages";
import { studioDevframe } from "../server/definition";
import { nodeFiles } from "../server/node-files";

const resolver = fileURLToPath(new URL("../../demo/tokens.resolver.json", import.meta.url));

export async function demoStudio(): Promise<Plugin[]> {
    const files = await nodeFiles(
        { ...fillDefaults({ resolver }), resolver },
        { onError: (error) => console.error(ErrorMessages.DEMO_FAILED, error) },
    );

    const watch: Plugin = {
        name: "studio:demo-tokens",
        apply: "serve",
        configureServer(server) {
            files.watch(server.watcher);
        },
    };

    return [devframeViteBridge(studioDevframe({ files }), { auth: false }), watch];
}
