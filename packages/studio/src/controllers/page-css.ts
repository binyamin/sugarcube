import type { Studio } from "./studio";

export function followCSS(
    studio: Studio,
    send: (css: string) => void,
    schedule: (run: () => void) => void,
): () => void {
    let sent: string | undefined;
    let waiting = false;
    let stopped = false;

    const flush = () => {
        waiting = false;
        if (stopped || studio.state.css === sent) return;
        sent = studio.state.css;
        send(sent);
    };
    const request = () => {
        if (waiting || studio.state.css === sent) return;
        waiting = true;
        schedule(flush);
    };

    const stop = studio.subscribe(request);
    request();

    return () => {
        stopped = true;
        stop();
    };
}
