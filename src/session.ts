import { Clearance, GenderEnum } from "@system-b90/hive-core";
import { Session } from "next-auth";

export type AuthSessionUser = {
    id: string;
    name: string;
    email: null | string;
    username: string;
    clearance: Clearance;
    program: null | number;
    gender: GenderEnum;
    display_name: string;
    is_teacher: boolean;
};

export type AuthSessionData = {
    user: AuthSessionUser;
    accessToken: string;
    refreshToken: string;
    error?: "TokenExpiredError";
} & Session;
