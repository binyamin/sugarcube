import type { InternalConfig } from "@sugarcube-sh/core/client";
import type { Conflict } from "@sugarcube-sh/dtcg-edit";
import type { PlainSettings } from "./adapters/plain";
import type { BuildProblem } from "./controllers/adapter";

export const STUDIO_RPC = {
    SAVE: "sugarcube:studio:save",
    MESSAGE: "sugarcube:studio:message",
    /** Not a method: studio's key in the handshake's `configs`. */
    CONFIG: "sugarcube:studio",
} as const;

/** Settings the host publishes in the handshake for clients to read. */
export type StudioConnectionConfig = {
    /** Where saves go when there's no server to write files, e.g. a service that opens a PR. */
    saveUrl?: string;
};

export type SaveOutcome =
    | { written: string[]; deleted: string[]; conflicts?: undefined }
    | { conflicts: Conflict[]; written?: undefined; deleted?: undefined };

export type StudioMessage = {
    readonly adapter: SentAdapter;
    readonly entry: string;
    readonly files: Readonly<Record<string, string>>;
};

export type SentAdapter =
    | {
          readonly name: "sugarcube";
          readonly settings: InternalConfig;
          readonly problems: readonly BuildProblem[];
      }
    | {
          readonly name: "plain";
          readonly settings: PlainSettings;
          readonly problems: readonly BuildProblem[];
      };
