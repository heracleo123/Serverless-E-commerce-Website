const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json'
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

const formatPublicReview = (review) => ({
    productId: review.productId,
    userId: review.userId,
    rating: Number(review.rating || 0),
    title: String(review.title || '').trim(),
    review: String(review.review || '').trim(),
    displayName: String(review.displayName || '').trim(),
    username: String(review.username || '').trim(),
    photoUrl: String(review.photoUrl || '').trim(),
    verifiedPurchase: review.verifiedPurchase !== false,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
});

const buildSummary = (reviews) => {
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0
        ? Math.round((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviewCount) * 10) / 10
        : 0;

    return { reviewCount, averageRating };
};

const ensurePurchasedProduct = async (userId, productId) => {
    const result = await docClient.send(new QueryCommand({
        TableName: process.env.ORDERS_TABLE,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        ScanIndexForward: false
    }));

    return (result.Items || []).some((order) => (
        String(order.status || '').toUpperCase() !== 'CANCELLED' &&
        (order.items || []).some((item) => item.productId === productId)
    ));
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            const productId = String(event.queryStringParameters?.productId || '').trim();
            if (!productId) {
                return { statusCode: 400, headers, body: JSON.stringify({ message: 'productId is required.' }) };
            }

            const result = await docClient.send(new QueryCommand({
                TableName: process.env.REVIEWS_TABLE,
                KeyConditionExpression: 'productId = :productId',
                ExpressionAttributeValues: {
                    ':productId': productId
                },
                ScanIndexForward: false
            }));

            const reviews = (result.Items || []).map(formatPublicReview);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    productId,
                    summary: buildSummary(reviews),
                    reviews,
                })
            };
        }

        if (event.httpMethod === 'POST') {
            const claims = getClaims(event);
            if (!claims.sub) {
                return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized.' }) };
            }

            const payload = JSON.parse(event.body || '{}');
            const productId = String(payload.productId || '').trim();
            const rating = Math.min(5, Math.max(1, Number(payload.rating || 0)));
            const title = String(payload.title || '').trim().slice(0, 80);
            const reviewText = String(payload.review || '').trim().slice(0, 600);

            if (!productId || !reviewText || !title || !Number.isFinite(rating)) {
                return { statusCode: 400, headers, body: JSON.stringify({ message: 'productId, rating, title, and review are required.' }) };
            }

            const purchasedProduct = await ensurePurchasedProduct(claims.sub, productId);
            if (!purchasedProduct) {
                return { statusCode: 403, headers, body: JSON.stringify({ message: 'Only customers who purchased this item can leave a review.' }) };
            }

            const [productResult, profileResult, existingReviewResult] = await Promise.all([
                docClient.send(new GetCommand({
                    TableName: process.env.PRODUCTS_TABLE,
                    Key: { productId }
                })),
                docClient.send(new GetCommand({
                    TableName: process.env.USER_PROFILES_TABLE,
                    Key: { userId: claims.sub }
                })),
                docClient.send(new GetCommand({
                    TableName: process.env.REVIEWS_TABLE,
                    Key: { productId, userId: claims.sub }
                }))
            ]);

            if (!productResult.Item) {
                return { statusCode: 404, headers, body: JSON.stringify({ message: 'Product not found.' }) };
            }

            const profile = profileResult.Item || {};
            const publicName = resolveStoredPublicName(
                profile.username,
                profile.displayName,
                String(claims.email || '').split('@')[0],
                'verified.customer'
            ) || 'verified.customer';
            const now = new Date().toISOString();
            const review = {
                productId,
                userId: claims.sub,
                rating,
                title,
                review: reviewText,
                displayName: publicName,
                username: publicName,
                photoUrl: String(profile.photoUrl || '').trim(),
                verifiedPurchase: true,
                createdAt: existingReviewResult.Item?.createdAt || now,
                updatedAt: now,
            };

            await docClient.send(new PutCommand({
                TableName: process.env.REVIEWS_TABLE,
                Item: review
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ review: formatPublicReview(review) })
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        console.error('Reviews error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Unable to process reviews.' })
        };
    }
};