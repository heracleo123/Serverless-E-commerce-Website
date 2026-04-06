const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
};

const buildReviewSummaryByProduct = (reviews) => {
    const summaryMap = new Map();

    for (const review of reviews) {
        const productId = String(review.productId || '').trim();
        const rating = Number(review.rating || 0);
        if (!productId || rating <= 0) {
            continue;
        }

        const current = summaryMap.get(productId) || { totalRating: 0, reviewCount: 0 };
        current.totalRating += rating;
        current.reviewCount += 1;
        summaryMap.set(productId, current);
    }

    return summaryMap;
};

exports.handler = async () => {
    try {
        const [productsResult, reviewsResult] = await Promise.all([
            client.send(new ScanCommand({ TableName: process.env.PRODUCTS_TABLE || "Products" })),
            process.env.REVIEWS_TABLE
                ? client.send(new ScanCommand({ TableName: process.env.REVIEWS_TABLE }))
                : Promise.resolve({ Items: [] })
        ]);

        const reviewSummaryByProduct = buildReviewSummaryByProduct(reviewsResult.Items || []);
        const products = (productsResult.Items || []).map((product) => {
            const reviewSummary = reviewSummaryByProduct.get(product.productId) || { totalRating: 0, reviewCount: 0 };
            const reviewCount = reviewSummary.reviewCount;
            const averageRating = reviewCount > 0 ? Math.round((reviewSummary.totalRating / reviewCount) * 10) / 10 : 0;

            return {
                ...product,
                price: Number(product.price || 0),
                stock: Number(product.stock || 0),
                images: Array.isArray(product.images) && product.images.length > 0
                    ? product.images.filter(Boolean).slice(0, 5)
                    : [product.imageUrl].filter(Boolean),
                reviewCount,
                averageRating,
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(products),
        };
    } catch (err) {
        console.error("Database Fetch Error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message }),
        };
    }
};