const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const ses = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const TRACKING_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

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

const normalizeOrderStatus = (status) => String(status || 'PENDING').trim().toUpperCase();

const shouldIncludeTracking = (status) => TRACKING_STATUSES.has(normalizeOrderStatus(status));

const normalizeOrder = (order) => ({
    ...order,
    trackingNumber: shouldIncludeTracking(order.status) ? String(order.trackingNumber || '').trim() : ''
});

const formatCurrency = (amount) => `$${Number(amount || 0).toFixed(2)}`;

const buildReceiptSummaryHtml = (order) => {
    const promoDetails = order.discountAmount > 0
        ? `
            <p style="margin: 0 0 8px;"><strong>Promo Code:</strong> ${order.promoCode || 'Applied'}</p>
            <p style="margin: 0 0 8px;"><strong>Discount:</strong> -${formatCurrency(order.discountAmount)}</p>
            <p style="margin: 0 0 8px;"><strong>Discounted Subtotal:</strong> ${formatCurrency(order.discountedSubtotal || order.subtotal)}</p>
          `
        : '';

    return `
        <div style="margin-bottom: 18px;">
            <p style="margin: 0 0 8px;"><strong>Subtotal:</strong> ${formatCurrency(order.subtotal)}</p>
            ${promoDetails}
            <p style="margin: 0 0 8px;"><strong>Tax:</strong> ${formatCurrency(order.taxAmount)}</p>
            <p style="margin: 0; font-size: 18px;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
        </div>
    `;
};

const buildReceiptHtml = (order) => {
    const itemsHtml = (order.items || []).map((item) => `
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.qty}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">$${Number(item.price).toFixed(2)}</td>
        </tr>
    `).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #18181b;">
            <div style="padding: 24px; border: 1px solid #e5e7eb; border-radius: 20px;">
                <p style="margin: 0 0 8px; color: #e11d48; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">ElectroTech Receipt</p>
                <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 800;">Thanks for your order</h1>
                <p style="margin: 0 0 16px; color: #52525b;">We appreciate you shopping with ElectroTech. Your order is in, your receipt is below, and our team will keep you posted as it moves along.</p>
                <p style="margin: 0 0 8px;"><strong>Order Number:</strong> ${order.orderId}</p>
                ${order.trackingNumber
            ? `<p style="margin: 0 0 8px;"><strong>Tracking Number:</strong> ${order.trackingNumber}</p>`
            : '<p style="margin: 0 0 8px; color: #52525b;">Tracking will be shared once your order ships.</p>'}
                <p style="margin: 0 0 24px;"><strong>Order Date:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleString('en-CA') : 'Recent'}</p>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding-bottom: 10px; font-size: 12px; text-transform: uppercase; color: #71717a;">Item</th>
                            <th style="text-align: center; padding-bottom: 10px; font-size: 12px; text-transform: uppercase; color: #71717a;">Qty</th>
                            <th style="text-align: right; padding-bottom: 10px; font-size: 12px; text-transform: uppercase; color: #71717a;">Price</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                ${buildReceiptSummaryHtml(order)}
                <p style="margin: 0 0 10px; color: #52525b;">Keep this email handy for your records. If you need help, send us your order number and we will jump in.</p>
                <p style="margin: 0; color: #52525b;">Thanks again for ordering with us. We hope you love your new gear.</p>
            </div>
        </div>
    `;
};

const sendConfirmationEmail = async (order, targetEmail) => {
    const normalizedOrder = normalizeOrder(order);

    await ses.send(new SendEmailCommand({
        Source: process.env.SES_FROM_ADDRESS,
        Destination: { ToAddresses: [targetEmail] },
        Message: {
            Subject: { Data: `Thanks for ordering with ElectroTech, ${normalizedOrder.orderId}` },
            Body: {
                Html: { Data: buildReceiptHtml(normalizedOrder) },
                Text: {
                    Data: [
                        'Thanks for ordering with ElectroTech.',
                        `Order Number: ${normalizedOrder.orderId}`,
                        ...(normalizedOrder.trackingNumber ? [`Tracking Number: ${normalizedOrder.trackingNumber}`] : ['Tracking: We will send it once your order ships.']),
                        `Subtotal: ${formatCurrency(normalizedOrder.subtotal)}`,
                        ...(Number(normalizedOrder.discountAmount || 0) > 0 ? [
                            `Promo Code: ${normalizedOrder.promoCode || 'Applied'}`,
                            `Discount: -${formatCurrency(normalizedOrder.discountAmount)}`,
                            `Discounted Subtotal: ${formatCurrency(normalizedOrder.discountedSubtotal || normalizedOrder.subtotal)}`
                        ] : []),
                        `Tax: ${formatCurrency(normalizedOrder.taxAmount)}`,
                        `Total: ${formatCurrency(normalizedOrder.total)}`,
                        '',
                        'We appreciate the order and our team will keep you posted as it moves along.',
                        '',
                        'Items:',
                        ...(normalizedOrder.items || []).map((item) => `- ${item.qty} x ${item.name} @ ${formatCurrency(item.price)}`),
                        '',
                        'Thanks again for shopping with us.'
                    ].join('\n')
                }
            }
        }
    }));
};

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Content-Type": "application/json"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    const authHeader = event.headers?.Authorization || event.headers?.authorization || "";
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const headerClaims = decodeJwtPayload(token) || {};
    const requestClaims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    const authenticatedUserId = requestClaims.sub || headerClaims.sub;
    const userEmail = requestClaims.email || headerClaims.email;

    if (!authenticatedUserId) {
        return { 
            statusCode: 401, 
            headers,
            body: JSON.stringify({ message: "Unauthorized: No valid session found." }) 
        };
    }

    console.log(`Fetching orders for user: ${userEmail} (${authenticatedUserId})`);

    try {
        if (event.httpMethod === "GET") {
            const result = await docClient.send(new QueryCommand({
                TableName: process.env.ORDERS_TABLE || "Orders",
                IndexName: "userId-index",
                KeyConditionExpression: "userId = :u",
                ExpressionAttributeValues: {
                    ":u": authenticatedUserId
                },
                ScanIndexForward: false
            }));

            const orders = (result.Items || []).map(normalizeOrder);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(orders)
            };
        }

        if (event.httpMethod === "POST") {
            const requestBody = JSON.parse(event.body || "{}");
            const targetEmail = String(requestBody.targetEmail || "").trim();
            const orderId = requestBody.orderId;
            const createdAt = requestBody.createdAt;

            if (!orderId || !createdAt || !targetEmail) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "orderId, createdAt, and targetEmail are required." })
                };
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: "Provide a valid email address." })
                };
            }

            const orderResult = await docClient.send(new GetCommand({
                TableName: process.env.ORDERS_TABLE || "Orders",
                Key: {
                    orderId,
                    createdAt
                }
            }));

            const order = orderResult.Item;

            if (!order || order.userId !== authenticatedUserId) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ message: "Order not found." })
                };
            }

            await sendConfirmationEmail(order, targetEmail);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    message: `Confirmation resent to ${targetEmail}.`,
                    orderId,
                    trackingNumber: normalizeOrder(order).trackingNumber
                })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: "Method Not Allowed" })
        };
    } catch (error) {
        console.error("Orders Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Could not process order request" })
        };
    }
};