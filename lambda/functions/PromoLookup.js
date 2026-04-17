const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const formatPromoDate = (value) => new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
});

const getPromoAvailability = (promo) => {
    if (!promo || promo.isActive === false) {
        return { available: false, message: 'Promo code is inactive.' };
    }

    const now = Date.now();
    const startsAt = promo.startsAt ? new Date(promo.startsAt).getTime() : null;
    const expiresAt = promo.expiresAt ? new Date(promo.expiresAt).getTime() : null;

    if (startsAt && startsAt > now) {
        return {
            available: false,
            message: `Promo code becomes active on ${formatPromoDate(promo.startsAt)}.`
        };
    }

    if (expiresAt && expiresAt < now) {
        return { available: false, message: 'Promo code has expired.' };
    }

    return { available: true, message: '' };
};

const isPromoAvailable = (promo) => {
    return getPromoAvailability(promo).available;
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const code = String(event.queryStringParameters?.code || '').trim().toUpperCase();

        if (!code) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Promo code is required.' })
            };
        }

        const result = await docClient.send(new GetCommand({
            TableName: process.env.PROMO_CODES_TABLE,
            Key: { code }
        }));

        const availability = getPromoAvailability(result.Item);

        if (!result.Item) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Promo code not found.' })
            };
        }

        if (!availability.available) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: availability.message || 'Promo code not found.' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result.Item)
        };
    } catch (error) {
        console.error('Promo lookup error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Unable to validate promo code.' })
        };
    }
};