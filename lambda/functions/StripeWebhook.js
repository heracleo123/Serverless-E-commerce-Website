const Stripe = require('stripe');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const normalizeOrderStatus = (status) => String(status || 'PENDING').trim().toUpperCase();
const TRACKING_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

const shouldIncludeTracking = (status) => TRACKING_STATUSES.has(normalizeOrderStatus(status));

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

const buildFulfillmentPayload = (session) => {
    const customerEmail = session.customer_details?.email;
    const customerPhone = session.customer_details?.phone;
    const totalAmount = Number(session.amount_total || 0) / 100;
    const userId = session.metadata?.userId;
    const minifiedItems = JSON.parse(session.metadata?.cartItems || '[]');
    const fullItems = minifiedItems.map((item) => ({
        productId: item.id,
        name: item.n,
        category: item.c,
        qty: item.q,
        price: item.p,
    }));
    const orderId = `STRIPE-${session.id.slice(-8)}`;
    const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || '';
    const createdAt = new Date().toISOString();
    const shippingAddress = session.metadata?.shippingAddress ? JSON.parse(session.metadata.shippingAddress) : null;
    const subtotal = Number(session.metadata?.subtotal || 0);
    const discountAmount = Number(session.metadata?.discountAmount || 0);
    const discountedSubtotal = Number(session.metadata?.discountedSubtotal || subtotal);
    const taxAmount = Number(session.metadata?.taxAmount || 0);
    const promoCode = String(session.metadata?.promoCode || '').trim();
    const promoDescription = String(session.metadata?.promoDescription || '').trim();

    return {
        order: {
            orderId,
            userId,
            items: fullItems,
            total: totalAmount,
            subtotal,
            discountAmount,
            discountedSubtotal,
            taxAmount,
            promoCode,
            promoDescription,
            status: 'PENDING',
            createdAt,
            trackingNumber: getTrackingNumberForStatus(orderId, 'PENDING'),
            statusHistory: [
                {
                    status: 'PENDING',
                    updatedAt: createdAt,
                }
            ],
            inventoryCommitted: false,
            email: customerEmail,
            phone: customerPhone,
            shippingAddress,
            checkoutSessionId: session.id,
            paymentIntentId,
            paymentStatus: String(session.payment_status || '').trim() || 'paid',
        },
    };
};

const enqueueFulfillment = async (stripeEvent) => {
    const session = stripeEvent.data.object;
    const payload = buildFulfillmentPayload(session);
    const orderId = payload.order.orderId;
    const messageGroupId = String(payload.order.userId || orderId || session.id).trim() || 'electrotech-order-events';

    await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.ORDER_EVENTS_QUEUE_URL,
        MessageBody: JSON.stringify({
            eventId: stripeEvent.id,
            eventType: stripeEvent.type,
            ...payload,
        }),
        MessageGroupId: messageGroupId,
        MessageDeduplicationId: String(stripeEvent.id || orderId || session.id),
    }));

    return orderId;
};

exports.handler = async (event) => {
    console.log('Webhook received. Header signature check...');

    const headers = event.headers || {};
    const sig = headers['stripe-signature'] || headers['Stripe-Signature'];

    if (!sig) {
        console.error('No Stripe signature found in headers.');
        return { statusCode: 400, body: 'Missing signature' };
    }

    let stripeEvent;
    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Signature verification failed: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        try {
            const queuedOrderId = await enqueueFulfillment(stripeEvent);
            console.log('Queued order fulfillment for', queuedOrderId);
        } catch (err) {
            console.error('Failed to queue post-payment processing:', err);
            return { statusCode: 500, body: JSON.stringify({ message: 'Unable to queue fulfillment event.' }) };
        }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};