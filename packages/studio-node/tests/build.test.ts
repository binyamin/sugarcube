import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StudioBuild, buildStudio } from "../src/build";
import { filesAt } from "./demo";

describe("buildStudio", () => {
    let outDir: string;
    let built: StudioBuild;

    beforeAll(async () => {
        outDir = mkdtempSync(join(tmpdir(), "studio-build-"));
        const files = await filesAt();
        built = await buildStudio({ files, outDir, saveUrl: "https://example.test/submit-pr" });
    }, 60_000);

    afterAll(() => {
        rmSync(outDir, { recursive: true, force: true });
    });

    it("names the folder to serve, and puts the hub inside it", () => {
        expect(built.rootDir).toBe(outDir);
        expect(built.hubDir).toBe(join(outDir, "__devframes"));
        expect(
            existsSync(join(built.rootDir, built.embedTag.match(/src="([^"]+)"/)?.[1] ?? "")),
        ).toBe(true);
        expect(existsSync(join(built.rootDir, built.studioPath, "index.html"))).toBe(true);
    });

    it("writes the hub folder with studio, the dock bootstrap and a static descriptor", () => {
        expect(existsSync(join(built.hubDir, "embedded.js"))).toBe(true);
        expect(existsSync(join(built.hubDir, "sugarcube-studio", "index.html"))).toBe(true);

        const meta = JSON.parse(readFileSync(join(built.hubDir, "__connection.json"), "utf8"));
        expect(meta.backend).toBe("static");
    });

    it("bakes the save address into the handshake", () => {
        const meta = JSON.parse(
            readFileSync(join(built.hubDir, "sugarcube-studio", "__connection.json"), "utf8"),
        );
        expect(meta.configs["sugarcube:studio"]).toEqual({
            saveUrl: "https://example.test/submit-pr",
        });
    });

    it("bakes the token files into the dump, so studio boots with no server", () => {
        const dumpDir = join(built.hubDir, "__rpc-dump");
        const records = readdirSync(dumpDir)
            .filter((name) => name.includes("record"))
            .map((name) => readFileSync(join(dumpDir, name), "utf8"))
            .join("\n");

        expect(records).toContain("sugarcube:studio:message");
        expect(records).toContain("color.json");
    });

    it("puts the page script in the dock, so an edit reaches a page the built studio is docked on", () => {
        expect(
            existsSync(join(built.hubDir, "sugarcube-studio", "__page-script", "page-script.mjs")),
        ).toBe(true);
    });

    it("tells the caller the tag and the path, relative to the site root", () => {
        expect(built.embedTag).toBe(
            '<script type="module" src="/__devframes/embedded.js"></script>',
        );
        expect(built.studioPath).toBe("/__devframes/sugarcube-studio/");
    });
});

describe("buildStudio with nothing to build", () => {
    it("refuses, naming the problems, rather than writing an empty studio", async () => {
        const outDir = mkdtempSync(join(tmpdir(), "studio-build-empty-"));
        const files = await filesAt(join(outDir, "missing.resolver.json"));

        await expect(buildStudio({ files, outDir })).rejects.toThrow(
            /^\[sugarcube studio\] Nothing to build[^]*missing\.resolver\.json/,
        );

        rmSync(outDir, { recursive: true, force: true });
    });
});
