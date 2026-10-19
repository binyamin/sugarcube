import { type StudioFiles, studioFiles } from "@sugarcube-sh/studio/server";
import type { SugarcubePluginContext } from "@sugarcube-sh/vite";

export function viteFiles(context: SugarcubePluginContext): StudioFiles {
    return studioFiles(() => context, context.onReload);
}
