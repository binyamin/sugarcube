import { type Project, openFromMemory } from "@sugarcube-sh/dtcg";

export function reread(project: Project, files: Record<string, string>): Project {
    return openFromMemory({ files, entry: project.entry }, project.options);
}
