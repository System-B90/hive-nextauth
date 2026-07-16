import { HiveClient, UserNotLoggedInError } from "@system-b90/hive-core";
import { AuthOptions, getServerSession } from "next-auth";

import { AuthSessionData } from "./session.js";

type HiveClientConstructor<C extends HiveClient> = new (
    accessToken: string,
    refreshToken?: string,
    hiveBaseUrl?: string,
) => C;

export function createHiveClientFromSession<C extends HiveClient = HiveClient>(
    session: AuthSessionData,
    clientCtor: HiveClientConstructor<C> = HiveClient as HiveClientConstructor<C>,
    hiveUrl?: string,
): C {
    if (!session.accessToken) {
        throw new UserNotLoggedInError(
            "Unauthorized: Active session or access token is missing.",
        );
    }

    return new clientCtor(
        session.accessToken as string,
        session.refreshToken as string,
        hiveUrl,
    );
}

export async function createHiveClient<C extends HiveClient = HiveClient>(
    authOptions: AuthOptions,
    clientCtor?: HiveClientConstructor<C>,
    hiveUrl?: string,
): Promise<C> {
    const session = await getServerSession(authOptions);
    if (!session) {
        throw new UserNotLoggedInError(
            "Unauthorized: No active session found.",
        );
    }
    return createHiveClientFromSession(
        session as AuthSessionData,
        clientCtor,
        hiveUrl,
    );
}
