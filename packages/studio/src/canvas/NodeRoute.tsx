import { useMemo } from "react";
import { Navigate, useLocation } from "react-router";
import { hrefFor, pathFromPathname } from "../app/token-path";
import { sidebarTree } from "../controllers/views";
import { useStudioState } from "../providers/studio-context";
import { GroupPage } from "./GroupPage";
import { TokenPage } from "./TokenPage";

export function useSelectedPath(): string | undefined {
    return pathFromPathname(useLocation().pathname);
}

export function NodeRoute() {
    const path = useSelectedPath();
    const tokens = useStudioState((state) => state.tokens);
    const showing = useStudioState((state) => state.showing);

    if (path === undefined) return <Home />;
    const group = showing.group(path);
    if (group) return <GroupPage group={group} />;
    const token = showing.token(path);
    if (token) return <TokenPage token={token} />;
    if (tokens.has(path)) return <p>Not in {showing.label}.</p>;
    return <p>Nothing at this address.</p>;
}

export function IndexRoute() {
    return <Home />;
}

function Home() {
    const tokens = useStudioState((state) => state.tokens);
    const first = useMemo(() => sidebarTree(tokens)[0], [tokens]);
    if (!first) return <p>This project has no tokens yet.</p>;
    return <Navigate to={hrefFor(first.path)} replace />;
}
