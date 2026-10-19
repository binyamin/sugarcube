import { createServer } from "node:http";
import { studioDevframe } from "@sugarcube-sh/studio/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { STUDIO_PORT, serveStudioHub } from "../src/hub";
import { filesAt } from "./demo";

vi.mock("devframe/utils/open", () => ({
    open: async () => {
        throw new Error("spawn xdg-open ENOENT");
    },
}));

describe("studioDevframe", () => {
    it("declares the studio route and dock without any host running", () => {
        const def = studioDevframe({ files: filesAt() });

        expect(def.id).toBe("sugarcube-studio");
        expect(def.basePath).toBe("/__studio/");
        expect(def.dock?.title).toBe("studio");
    });
});

describe("serveStudioHub", () => {
    let hub: Awaited<ReturnType<typeof serveStudioHub>>;

    beforeAll(async () => {
        hub = await serveStudioHub({ files: await filesAt(), port: 0 });
    }, 30_000);

    afterAll(async () => {
        await hub?.close();
    });

    it("listens on a real port", () => {
        expect(hub.port).toBeGreaterThan(0);
        expect(hub.origin).toMatch(/^http:\/\/localhost:\d+$/);
    });

    it("serves studio full width under the hub", async () => {
        const response = await fetch(hub.studioUrl);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("serves the connection descriptor the browser client fetches first", async () => {
        const response = await fetch(`${hub.origin}/__devframes/__connection.json`);

        expect(response.status).toBe(200);
        const meta = (await response.json()) as { backend?: string };
        expect(meta.backend).toBe("websocket");
    });

    it("serves the dock bootstrap a page on another port loads, with CORS for it", async () => {
        const response = await fetch(hub.embedScriptUrl, {
            headers: { Origin: "http://localhost:8080" },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");
    });

    it("refuses a foreign origin", async () => {
        const response = await fetch(hub.embedScriptUrl, {
            headers: { Origin: "https://evil.example" },
        });

        expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("serves the page script the dock imports into the page, where the hub put it", async () => {
        const response = await fetch(
            `${hub.origin}/__devframes/sugarcube-studio/__page-script/page-script.mjs`,
            { headers: { Origin: "http://localhost:8080" } },
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("export");
        expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");
    });
});

describe("serveStudioHub, when things go wrong", () => {
    it("has a fixed port by default, so a pasted script tag keeps working", () => {
        expect(STUDIO_PORT).toBe(2823);
    });

    it("says so when the port asked for is taken, rather than waiting forever", async () => {
        const taken = createServer();
        await new Promise<void>((resolve) => taken.listen(0, "localhost", resolve));
        const address = taken.address();
        const port = typeof address === "object" && address ? address.port : 0;

        await expect(serveStudioHub({ files: await filesAt(), port })).rejects.toMatchObject({
            code: "EADDRINUSE",
        });

        await new Promise<void>((resolve) => taken.close(() => resolve()));
    });

    it("still serves when the browser cannot be opened", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const hub = await serveStudioHub({ files: await filesAt(), port: 0, open: true });

        expect((await fetch(hub.studioUrl)).status).toBe(200);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(hub.studioUrl));
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[sugarcube studio\] /));

        warn.mockRestore();
        await hub.close();
    });
});
