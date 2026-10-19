/// <reference types="devframe" />

import type { STUDIO_RPC, SaveOutcome, StudioConnectionConfig } from "../protocol";

declare module "devframe" {
    interface DevframeRpcServerFunctions {
        [STUDIO_RPC.SAVE]: (sent: unknown) => Promise<SaveOutcome>;
    }

    interface DevframeConnectionConfigsRegistry {
        [STUDIO_RPC.CONFIG]: StudioConnectionConfig;
    }
}
