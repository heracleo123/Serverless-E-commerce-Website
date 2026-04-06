const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});
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

const normalizeDisplayName = (displayName) => String(displayName || '').trim().slice(0, 50);

const firstNonEmptyString = (...values) => {
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
};

const joinNameParts = (...parts) => firstNonEmptyString(parts.map((part) => String(part || '').trim()).filter(Boolean).join(' '));

const getPrimaryAddressFullName = (addresses) => {
    const primaryAddress = (Array.isArray(addresses) ? addresses : []).find((address) => String(address?.fullName || '').trim());
    return String(primaryAddress?.fullName || '').trim();
};

const resolvePreferredDisplayName = ({ displayName, username, addresses, email, givenName, familyName, fullName }) => {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const isLegacySlugDisplayName = Boolean(
        normalizedDisplayName
        && username
        && normalizedDisplayName === username
        && normalizedDisplayName === sanitizePublicName(normalizedDisplayName)
    );
    const explicitName = isLegacySlugDisplayName
        ? ''
        : firstNonEmptyString(normalizedDisplayName, username);
    if (explicitName) {
        return explicitName;
    }

    const fallbackName = firstNonEmptyString(
        joinNameParts(givenName, familyName),
        fullName,
        getPrimaryAddressFullName(addresses)
    );

    if (fallbackName) {
        return fallbackName;
    }

    return firstNonEmptyString(String(email || '').split('@')[0]);
};

const sanitizePublicName = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

const resolveStoredPublicName = (...values) => {
    for (const value of values) {
        const nextValue = sanitizePublicName(value);
        if (nextValue) {
            return nextValue;
        }
    }

    return '';
};

const normalizeUsername = (username) => {
    const normalized = sanitizePublicName(username);
    if (!normalized) {
        return '';
    }

    if (normalized.length < 3 || normalized.length > 24) {
        throw new Error('Username must be between 3 and 24 characters.');
    }

    return normalized;
};

const sanitizeFileName = (name) => String(name || 'profile-photo').replace(/[^a-zA-Z0-9._-]/g, '_');

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

const ensureUniqueUsername = async (userId, username) => {
    if (!username) {
        return;
    }

    const result = await docClient.send(new ScanCommand({
        TableName: process.env.USER_PROFILES_TABLE,
        ProjectionExpression: 'userId, username'
    }));

    const conflict = (result.Items || []).find((item) => (
        item.userId !== userId && String(item.username || '').trim().toLowerCase() === username
    ));

    if (conflict) {
        throw new Error('That username is already taken.');
    }
};

const uploadProfilePhoto = async (userId, photoFile) => {
    if (!photoFile?.fileData || !process.env.S3_BUCKET || !process.env.CDN_URL) {
        return '';
    }

    const match = String(photoFile.fileData || '').match(/^data:(.+);base64,(.+)$/);
    const base64 = match ? match[2] : String(photoFile.fileData || '');
    const fileType = photoFile.fileType || match?.[1] || 'image/jpeg';
    const key = `profiles/${userId}-${Date.now()}-${sanitizeFileName(photoFile.fileName || 'profile-photo.jpg')}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: Buffer.from(base64, 'base64'),
        ContentType: fileType,
    }));

    return `${process.env.CDN_URL}/${key}`;
};

const buildBaseProfile = (claims) => ({
    userId: claims.sub,
    email: claims.email || '',
    username: '',
    displayName: '',
    photoUrl: '',
    addresses: [],
    defaultAddressId: null,
    birthDate: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
});

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

    const baseProfile = buildBaseProfile(claims);

    try {
        if (event.httpMethod === 'GET') {
            const result = await docClient.send(new GetCommand({
                TableName: process.env.USER_PROFILES_TABLE,
                Key: { userId: claims.sub }
            }));

            const storedProfile = result.Item || {};
            const resolvedDisplayName = resolvePreferredDisplayName({
                displayName: storedProfile.displayName,
                username: storedProfile.username,
                addresses: storedProfile.addresses,
                email: storedProfile.email || claims.email,
                givenName: claims.given_name,
                familyName: claims.family_name,
                fullName: claims.name,
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ...baseProfile,
                    ...storedProfile,
                    username: resolveStoredPublicName(storedProfile.username, storedProfile.displayName),
                    displayName: resolvedDisplayName,
                    photoUrl: String(storedProfile.photoUrl || '').trim(),
                    birthDate: normalizeBirthDate(storedProfile.birthDate)
                })
            };
        }

        if (event.httpMethod === 'PUT') {
            const payload = JSON.parse(event.body || '{}');
            const existingProfileResult = await docClient.send(new GetCommand({
                TableName: process.env.USER_PROFILES_TABLE,
                Key: { userId: claims.sub }
            }));

            const existingProfile = existingProfileResult.Item || {};
            const addresses = normalizeAddresses(payload.addresses);
            const defaultAddressId = addresses.some((address) => address.id === payload.defaultAddressId)
                ? payload.defaultAddressId
                : addresses[0]?.id || null;
            const displayName = normalizeDisplayName(payload.displayName);
            const username = displayName ? normalizeUsername(displayName) : '';

            await ensureUniqueUsername(claims.sub, username);

            const uploadedPhotoUrl = payload.photoFile
                ? await uploadProfilePhoto(claims.sub, payload.photoFile)
                : '';

            const profile = {
                ...baseProfile,
                ...existingProfile,
                addresses,
                defaultAddressId,
                username,
                displayName,
                photoUrl: payload.removePhoto ? '' : (uploadedPhotoUrl || existingProfile.photoUrl || ''),
                birthDate: validateAdultBirthDate(payload.birthDate),
                createdAt: existingProfile.createdAt || baseProfile.createdAt,
                updatedAt: new Date().toISOString()
            };

            await docClient.send(new PutCommand({
                TableName: process.env.USER_PROFILES_TABLE,
                Item: profile
            }));

            const responseProfile = {
                ...profile,
                displayName: resolvePreferredDisplayName({
                    displayName: profile.displayName,
                    username: profile.username,
                    addresses: profile.addresses,
                    email: profile.email || claims.email,
                    givenName: claims.given_name,
                    familyName: claims.family_name,
                    fullName: claims.name,
                })
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(responseProfile)
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        console.error('User profile error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Unable to process profile.' })
        };
    }
};