import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getUserByDeviceIdQuery = `-- name: GetUserByDeviceId :one
SELECT id, device_id, push_token, earnings, created_at FROM users WHERE device_id = $1`;

export interface GetUserByDeviceIdArgs {
    deviceId: string;
}

export interface GetUserByDeviceIdRow {
    id: string;
    deviceId: string;
    pushToken: string | null;
    earnings: number;
    createdAt: Date;
}

export async function getUserByDeviceId(client: Client, args: GetUserByDeviceIdArgs): Promise<GetUserByDeviceIdRow | null> {
    const result = await client.query({
        text: getUserByDeviceIdQuery,
        values: [args.deviceId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        deviceId: row[1],
        pushToken: row[2],
        earnings: row[3],
        createdAt: row[4]
    };
}

export const createUserQuery = `-- name: CreateUser :one
INSERT INTO users (device_id, push_token)
VALUES ($1, $2)
RETURNING id, device_id, push_token, earnings, created_at`;

export interface CreateUserArgs {
    deviceId: string;
    pushToken: string | null;
}

export interface CreateUserRow {
    id: string;
    deviceId: string;
    pushToken: string | null;
    earnings: number;
    createdAt: Date;
}

export async function createUser(client: Client, args: CreateUserArgs): Promise<CreateUserRow | null> {
    const result = await client.query({
        text: createUserQuery,
        values: [args.deviceId, args.pushToken],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        deviceId: row[1],
        pushToken: row[2],
        earnings: row[3],
        createdAt: row[4]
    };
}

export const updateUserPushTokenQuery = `-- name: UpdateUserPushToken :exec
UPDATE users SET push_token = $2 WHERE id = $1`;

export interface UpdateUserPushTokenArgs {
    id: string;
    pushToken: string | null;
}

export async function updateUserPushToken(client: Client, args: UpdateUserPushTokenArgs): Promise<void> {
    await client.query({
        text: updateUserPushTokenQuery,
        values: [args.id, args.pushToken],
        rowMode: "array"
    });
}

export const updateUserEarningsQuery = `-- name: UpdateUserEarnings :exec
UPDATE users SET earnings = earnings + $2 WHERE id = $1`;

export interface UpdateUserEarningsArgs {
    id: string;
    earnings: number;
}

export async function updateUserEarnings(client: Client, args: UpdateUserEarningsArgs): Promise<void> {
    await client.query({
        text: updateUserEarningsQuery,
        values: [args.id, args.earnings],
        rowMode: "array"
    });
}

export const getUserEarningsQuery = `-- name: GetUserEarnings :one
SELECT id, earnings FROM users WHERE id = $1`;

export interface GetUserEarningsArgs {
    id: string;
}

export interface GetUserEarningsRow {
    id: string;
    earnings: number;
}

export async function getUserEarnings(client: Client, args: GetUserEarningsArgs): Promise<GetUserEarningsRow | null> {
    const result = await client.query({
        text: getUserEarningsQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        earnings: row[1]
    };
}

export const getClipsByProductIdQuery = `-- name: GetClipsByProductId :many
SELECT c.id, c.user_id, c.product_id, c.video_url, c.conversions, c.created_at, u.device_id as creator_device_id
FROM clips c
JOIN users u ON c.user_id = u.id
WHERE c.product_id = $1
ORDER BY c.conversions DESC
LIMIT 20`;

export interface GetClipsByProductIdArgs {
    productId: string;
}

export interface GetClipsByProductIdRow {
    id: string;
    userId: string;
    productId: string;
    videoUrl: string;
    conversions: number;
    createdAt: Date;
    creatorDeviceId: string;
}

export async function getClipsByProductId(client: Client, args: GetClipsByProductIdArgs): Promise<GetClipsByProductIdRow[]> {
    const result = await client.query({
        text: getClipsByProductIdQuery,
        values: [args.productId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            userId: row[1],
            productId: row[2],
            videoUrl: row[3],
            conversions: row[4],
            createdAt: row[5],
            creatorDeviceId: row[6]
        };
    });
}

export const getClipByIdQuery = `-- name: GetClipById :one
SELECT id, user_id, product_id, video_url, conversions, created_at FROM clips WHERE id = $1`;

export interface GetClipByIdArgs {
    id: string;
}

export interface GetClipByIdRow {
    id: string;
    userId: string;
    productId: string;
    videoUrl: string;
    conversions: number;
    createdAt: Date;
}

export async function getClipById(client: Client, args: GetClipByIdArgs): Promise<GetClipByIdRow | null> {
    const result = await client.query({
        text: getClipByIdQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        userId: row[1],
        productId: row[2],
        videoUrl: row[3],
        conversions: row[4],
        createdAt: row[5]
    };
}

export const createClipQuery = `-- name: CreateClip :one
INSERT INTO clips (user_id, product_id, video_url)
VALUES ($1, $2, $3)
RETURNING id, user_id, product_id, video_url, conversions, created_at`;

export interface CreateClipArgs {
    userId: string;
    productId: string;
    videoUrl: string;
}

export interface CreateClipRow {
    id: string;
    userId: string;
    productId: string;
    videoUrl: string;
    conversions: number;
    createdAt: Date;
}

export async function createClip(client: Client, args: CreateClipArgs): Promise<CreateClipRow | null> {
    const result = await client.query({
        text: createClipQuery,
        values: [args.userId, args.productId, args.videoUrl],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        userId: row[1],
        productId: row[2],
        videoUrl: row[3],
        conversions: row[4],
        createdAt: row[5]
    };
}

export const incrementClipConversionsQuery = `-- name: IncrementClipConversions :exec
UPDATE clips SET conversions = conversions + 1 WHERE id = $1`;

export interface IncrementClipConversionsArgs {
    id: string;
}

export async function incrementClipConversions(client: Client, args: IncrementClipConversionsArgs): Promise<void> {
    await client.query({
        text: incrementClipConversionsQuery,
        values: [args.id],
        rowMode: "array"
    });
}

export const getClipWithUserQuery = `-- name: GetClipWithUser :one
SELECT c.id, c.user_id, c.product_id, c.video_url, c.conversions, c.created_at, u.push_token, u.id as creator_user_id
FROM clips c
JOIN users u ON c.user_id = u.id
WHERE c.id = $1`;

export interface GetClipWithUserArgs {
    id: string;
}

export interface GetClipWithUserRow {
    id: string;
    userId: string;
    productId: string;
    videoUrl: string;
    conversions: number;
    createdAt: Date;
    pushToken: string | null;
    creatorUserId: string;
}

export async function getClipWithUser(client: Client, args: GetClipWithUserArgs): Promise<GetClipWithUserRow | null> {
    const result = await client.query({
        text: getClipWithUserQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        userId: row[1],
        productId: row[2],
        videoUrl: row[3],
        conversions: row[4],
        createdAt: row[5],
        pushToken: row[6],
        creatorUserId: row[7]
    };
}

export const getReceiptByIdQuery = `-- name: GetReceiptById :one
SELECT id, product_ids, used_for_conversions, created_at FROM receipts WHERE id = $1`;

export interface GetReceiptByIdArgs {
    id: string;
}

export interface GetReceiptByIdRow {
    id: string;
    productIds: string[];
    usedForConversions: boolean;
    createdAt: Date;
}

export async function getReceiptById(client: Client, args: GetReceiptByIdArgs): Promise<GetReceiptByIdRow | null> {
    const result = await client.query({
        text: getReceiptByIdQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        productIds: row[1],
        usedForConversions: row[2],
        createdAt: row[3]
    };
}

export const createReceiptQuery = `-- name: CreateReceipt :one
INSERT INTO receipts (product_ids)
VALUES ($1)
RETURNING id, product_ids, used_for_conversions, created_at`;

export interface CreateReceiptArgs {
    productIds: string[];
}

export interface CreateReceiptRow {
    id: string;
    productIds: string[];
    usedForConversions: boolean;
    createdAt: Date;
}

export async function createReceipt(client: Client, args: CreateReceiptArgs): Promise<CreateReceiptRow | null> {
    const result = await client.query({
        text: createReceiptQuery,
        values: [args.productIds],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        productIds: row[1],
        usedForConversions: row[2],
        createdAt: row[3]
    };
}

export const markReceiptUsedQuery = `-- name: MarkReceiptUsed :exec
UPDATE receipts SET used_for_conversions = TRUE WHERE id = $1`;

export interface MarkReceiptUsedArgs {
    id: string;
}

export async function markReceiptUsed(client: Client, args: MarkReceiptUsedArgs): Promise<void> {
    await client.query({
        text: markReceiptUsedQuery,
        values: [args.id],
        rowMode: "array"
    });
}

