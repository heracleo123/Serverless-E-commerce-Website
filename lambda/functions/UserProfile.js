const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ADULT_AGE_YEARS = 18;

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const decodeJwtPayload = (token) => {
    if (!token) return null;

    try {
        const [, payload] = token.split('.');
        if (!payload) return null;

        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch (error) {
        console.error('JWT decode failed:', error);
        return null;
    }
};

const getClaims = (event) => {
    const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const headerClaims = decodeJwtPayload(token) || {};
    const requestClaims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    return { ...headerClaims, ...requestClaims };
};

const normalizeBirthDate = (birthDate) => {
    const normalized = String(birthDate || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

const validateAdultBirthDate = (birthDate) => {
    const normalized = normalizeBirthDate(birthDate);
    if (!normalized) {
        return '';
    }

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - ADULT_AGE_YEARS);
    cutoffDate.setHours(23, 59, 59, 999);
    const parsedDate = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate > cutoffDate) {
        throw new Error('Users must be at least 18 years old.');
    }

    return normalized;
};

const normalizeAddresses = (addresses) => {
    return (Array.isArray(addresses) ? addresses : [])
        .map((address, index) => ({
            id: address.id || `address-${index + 1}`,
            label: String(address.label || 'Address').trim(),
            fullName: String(address.fullName || '').trim(),
            line1: String(address.line1 || '').trim(),
            line2: String(address.line2 || '').trim(),
            city: String(address.city || '').trim(),
            province: String(address.province || '').trim(),
            postalCode: String(address.postalCode || '').trim(),
            country: String(address.country || 'Canada').trim()
        }))
        .filter((address) => address.fullName && address.line2 && address.line1 && address.city && address.province && address.postalCode && address.country)
        .slice(0, 5);
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const claims = getClaims(event);
    if (!claims.sub) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ message: 'Unauthorized.' })
        };
    }

    const baseProfile = {
        userId: claims.sub,
        email: claims.email || '',
        addresses: [],
        defaultAddressId: null,
        birthDate: ''
    };

    try {
        if (event.httpMethod === 'GET') {
            const result = await docClient.send(new GetCommand({
                TableName: process.env.USER_PROFILES_TABLE,
                Key: { userId: claims.sub }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ...baseProfile,
                    ...(result.Item || {}),
                    birthDate: normalizeBirthDate(result.Item?.birthDate)
                })
            };
        }

        if (event.httpMethod === 'PUT') {
            const payload = JSON.parse(event.body || '{}');
            const addresses = normalizeAddresses(payload.addresses);
            const defaultAddressId = addresses.some((address) => address.id === payload.defaultAddressId)
                ? payload.defaultAddressId
                : addresses[0]?.id || null;

            const profile = {
                ...baseProfile,
                addresses,
                defaultAddressId,
                birthDate: validateAdultBirthDate(payload.birthDate),
                updatedAt: new Date().toISOString()
            };

            await docClient.send(new PutCommand({
                TableName: process.env.USER_PROFILES_TABLE,
                Item: profile
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(profile)
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        console.error('User profile error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Unable to process profile.' })
        };
    }
};