import { type Project, openFromMemory } from "@sugarcube-sh/dtcg";
import { bench, describe } from "vitest";
import {
    type OpResult,
    commit,
    create,
    createSession,
    remove,
    setDescription,
    setValue,
} from "../../src/index.js";
import { project } from "./projects.js";

const red = { colorSpace: "srgb", components: [1, 0, 0] };
const dark = { context: { theme: "dark" } };

const operations: [string, (project: Project) => OpResult][] = [
    ["setValue, the shared value", (p) => setValue(p, "color.c0", red)],
    ["setValue, dark's override", (p) => setValue(p, "color.c0", red, dark)],
    ["setValue, a new override for dark", (p) => setValue(p, "color.c1", red, dark)],
    ["setDescription, written in two files", (p) => setDescription(p, "color.c0", "Red.")],
    ["create a token", (p) => create(p, "color", "fresh", { $value: red })],
    ["create a group", (p) => create(p, "color", "fresh", { group: true })],
    ["remove a token", (p) => remove(p, "color.c2")],
    ["remove a group", (p) => remove(p, "space")],
];

function edits(name: string, opened: Project) {
    describe(name, () => {
        bench("read alone", () => {
            openFromMemory({ files: opened.files, entry: opened.entry }, opened.options);
        });
        for (const [label, operation] of operations) {
            const result = operation(opened);
            bench(`${label}: the operation`, () => {
                operation({ ...opened, files: { ...opened.files } });
            });
            bench(`${label}: commit`, () => {
                commit(opened, result);
            });
        }
        const kept = createSession(opened);
        kept.do(setValue(kept.project, "color.c0", red));
        kept.do(setValue(kept.project, "space.s0", { value: 3, unit: "rem" }));
        bench("restore two edits after a reload", () => {
            createSession(opened).restore(kept.unsaved);
        });
        bench("restore two edits, then adopt the files changed on disk", () => {
            const editing = createSession(opened);
            editing.restore(kept.unsaved);
            editing.adopt(opened);
        });
        const session = createSession(opened);
        let turn = 0;
        bench("setValue, the shared value: operation and session.do", () => {
            turn += 1;
            const value = { ...red, alpha: turn % 2 ? 1 : 0.5 };
            session.do(setValue(session.project, "color.c0", value));
        });
    });
}

edits("150 tokens a group, 450 in all", project(150));
edits("the same, with 150 more a generator makes", project(150, { generated: 150 }));
