const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const normalizeOrderStatus = (status) => String(status || 'PENDING').trim().toUpperCase();
const TRACKING_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

const shouldIncludeTracking = (status) => TRACKING_STATUSES.has(normalizeOrderStatus(status));

const formatCurrency = (amount) => `$${Number(amount || 0).toFixed(2)}`;

const groupItemsByProduct = (items) => {
    const grouped = new Map();

    for (const item of Array.isArray(items) ? items : []) {
        const productId = String(item.productId || '').trim();
        const qty = Math.max(1, Number(item.qty || 1));

        if (!productId || qty <= 0) {
            continue;
        }

        grouped.set(productId, (grouped.get(productId) || 0) + qty);
    }

    return Array.from(grouped.entries()).map(([productId, qty]) => ({ productId, qty }));
};

const reserveInventory = async (items) => {
    const groupedItems = groupItemsByProduct(items);
    if (groupedItems.length === 0) {
        return;
    }

    const updatedAt = new Date().toISOString();
    await docClient.send(new TransactWriteCommand({
        TransactItems: groupedItems.map((item) => ({
            Update: {
                TableName: process.env.PRODUCTS_TABLE || 'Products',
                Key: { productId: item.productId },
                UpdateExpression: 'SET stock = stock + :delta, updatedAt = :updatedAt',
                ConditionExpression: 'attribute_exists(productId) AND stock >= :requiredQty',
                ExpressionAttributeValues: {
                    ':delta': -item.qty,
                    ':requiredQty': item.qty,
                    ':updatedAt': updatedAt,
                }
            }
        }))
    }));
};

const buildTrackingNumber = (orderId) => {
    const compactOrderId = String(orderId || 'ORDER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `ET-${compactOrderId.slice(-12).padStart(12, '0')}`;
};

const getTrackingNumberForStatus = (orderId, status, existingTrackingNumber) => {
    const currentTrackingNumber = String(existingTrackingNumber || '').trim();
    if (currentTrackingNumber) {
        return currentTrackingNumber;
    }

    return shouldIncludeTracking(status) ? buildTrackingNumber(orderId) : '';
};

const buildOrderReceivedHtml = (order) => {
    const promoDetails = order.discountAmount > 0
        ? `
            <p style="margin: 0 0 8px;"><strong>Promo Code:</strong> ${order.promoCode || 'Applied'}</p>
            <p style="margin: 0 0 8px;"><strong>Discount:</strong> -${formatCurrency(order.discountAmount)}</p>
            <p style="margin: 0 0 8px;"><strong>Discounted Subtotal:</strong> ${formatCurrency(order.discountedSubtotal || order.subtotal)}</p>
          `
        : '';

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #18181b;">
            <div style="padding: 24px; border: 1px solid #e5e7eb; border-radius: 20px;">
                <p style="margin: 0 0 8px; color: #e11d48; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">ElectroTech Order Received</p>
                <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 800;">Thanks for ordering with us</h1>
                <p style="margin: 0 0 16px; color: #52525b;">Your order is locked in and our team is getting it ready. Thanks for choosing ElectroTech.</p>
                <p style="margin: 0 0 8px;"><strong>Order Number:</strong> ${order.orderId}</p>
                <p style="margin: 0 0 8px;"><strong>Status:</strong> ${order.status}</p>
                <p style="margin: 0 0 8px;"><strong>Order Date:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleString('en-CA') : 'Recent'}</p>
                <p style="margin: 0 0 8px;"><strong>Subtotal:</strong> ${formatCurrency(order.subtotal)}</p>
                ${promoDetails}
                <p style="margin: 0 0 8px;"><strong>Tax:</strong> ${formatCurrency(order.taxAmount)}</p>
                <p style="margin: 0 0 18px; font-size: 18px;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
                <p style="margin: 0 0 12px; color: #52525b;">Your payment came through successfully and your order is now queued for review.</p>
                <p style="margin: 0; color: #52525b;">We will send another update with tracking details as soon as it ships.</p>
            </div>
        </div>
    `;
};

const buildOrderConfirmationText = (order) => [
    'Thanks for ordering with ElectroTech.',
    `Order Number: ${order.orderId}`,
    `Status: ${order.status}`,
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    ...(Number(order.discountAmount || 0) > 0 ? [
        `Promo Code: ${order.promoCode || 'Applied'}`,
        `Discount: -${formatCurrency(order.discountAmount)}`,
        `Discounted Subtotal: ${formatCurrency(order.discountedSubtotal || order.subtotal)}`
    ] : []),
    `Tax: ${formatCurrency(order.taxAmount)}`,
    `Total: ${formatCurrency(order.total)}`,
    '',
    'Your payment was received successfully and your order is now pending review.',
    'We will send a follow-up email with tracking details when the order status changes.',
    '',
    'Thanks again for shopping with us.'
].join('\n');

const loadExistingOrder = async (orderId) => {
    const result = await docClient.send(new QueryCommand({
        TableName: process.env.ORDERS_TABLE || 'Orders',
        KeyConditionExpression: 'orderId = :orderId',
        ExpressionAttributeValues: {
            ':orderId': orderId,
        },
        Limit: 1,
    }));

    return result.Items?.[0] || null;
};

const validateOrderPayload = (payload) => {
    const order = payload?.order;
    if (!order || !order.orderId || !order.createdAt) {
        throw new Error('Order payload is missing required fields.');
    }

    return {
        ...order,
        status: normalizeOrderStatus(order.status),
        trackingNumber: getTrackingNumberForStatus(order.orderId, order.status, order.trackingNumber),
        items: Array.isArray(order.items) ? order.items : [],
        statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
    };
};

const processOrder = async (order) => {
    const existingOrder = await loadExistingOrder(order.orderId);
    if (existingOrder) {
        console.log(`Skipping duplicate fulfillment for ${order.orderId}`);
        return existingOrder;
    }

    const nextOrder = {
        ...order,
        inventoryCommitted: false,
    };

    try {
        await reserveInventory(nextOrder.items);
        nextOrder.inventoryCommitted = true;
    } catch (inventoryError) {
        console.error('Inventory reservation failed:', inventoryError);
        nextOrder.inventoryCommitted = false;
        nextOrder.inventoryWarning = 'Inventory reservation pending manual review.';
    }

    await docClient.send(new PutCommand({
        TableName: process.env.ORDERS_TABLE || 'Orders',
        Item: nextOrder,
    }));

    if (nextOrder.email) {
        await ses.send(new SendEmailCommand({
            Source: process.env.SES_FROM_ADDRESS,
            Destination: { ToAddresses: [nextOrder.email] },
            Message: {
                Subject: { Data: `Thanks for your ElectroTech order, ${nextOrder.orderId}` },
                Body: {
                    Html: {
                        Data: buildOrderReceivedHtml(nextOrder),
                    },
                    Text: {
                        Data: buildOrderConfirmationText(nextOrder),
                    }
                }
            }
        }));
    }

    if (nextOrder.phone) {
        await sns.send(new PublishCommand({
            Message: `ElectroTech: Order ${nextOrder.orderId} received. It is now pending review.`,
            PhoneNumber: nextOrder.phone,
        }));
    }

    return nextOrder;
};

exports.handler = async (event) => {
    const records = Array.isArray(event?.Records) ? event.Records : [];

    for (const record of records) {
        const payload = JSON.parse(record.body || '{}');
        const order = validateOrderPayload(payload);
        await processOrder(order);
    }

    return {
        batchItemFailures: [],
    };
};