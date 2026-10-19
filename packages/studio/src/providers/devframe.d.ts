/// <reference types="devframe" />

import type { STUDIO_RPC, StudioConnectionConfig } from "../protocol";
import type { Saved } from "../server/save";

declare module "devframe" {
    interface DevframeRpcServerFunctions {
        [STUDIO_RPC.SAVE]: (sent: unknown) => Promise<Saved>;
    }

    interface DevframeConnectionConfigsRegistry {
        [STUDIO_RPC.CONFIG]: StudioConnectionConfig;
    }
}
