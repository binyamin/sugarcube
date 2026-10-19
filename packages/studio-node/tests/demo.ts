import { fileURLToPath } from "node:url";
import { fillDefaults } from "@sugarcube-sh/core";
import { nodeFiles } from "@sugarcube-sh/studio/server";

export const demoResolver = fileURLToPath(
    new URL("../../studio/demo/tokens.resolver.json", import.meta.url),
);

export function filesAt(resolver = demoResolver) {
    return nodeFiles(
        { ...fillDefaults({ resolver }), resolver },
        {
            onError: (error) => {
                throw error;
            },
        },
    );
}
