/// <reference types="devframe" />

import type { STUDIO_RPC, Saved, StudioConnectionConfig } from "../protocol";

declare module "devframe" {
    interface DevframeRpcServerFunctions {
        [STUDIO_RPC.SAVE]: (sent: unknown) => Promise<Saved>;
    }

    interface DevframeConnectionConfigsRegistry {
        [STUDIO_RPC.CONFIG]: StudioConnectionConfig;
    }
}
