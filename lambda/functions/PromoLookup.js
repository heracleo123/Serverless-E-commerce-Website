const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

const isPromoAvailable = (promo) => {
    if (!promo || promo.isActive === false) {
        return false;
    }

    if (!promo.expiresAt) {
        return true;
    }

    return new Date(promo.expiresAt).getTime() >= Date.now();
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

        if (!result.Item || !isPromoAvailable(result.Item)) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Promo code not found.' })
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