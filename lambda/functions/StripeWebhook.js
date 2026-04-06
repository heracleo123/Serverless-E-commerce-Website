const Stripe = require('stripe');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });
const sns = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });

const formatCurrency = (amount) => `$${Number(amount || 0).toFixed(2)}`;

const buildTrackingNumber = (orderId) => {
    const compactOrderId = String(orderId || 'ORDER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `ET-${compactOrderId.slice(-12).padStart(12, '0')}`;
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

exports.handler = async (event) => {
    /* --- 1. SECURITY & SIGNATURE VERIFICATION --- */
    // Log the event so you can debug in CloudWatch
    console.log("Webhook received. Header signature check...");

    const headers = event.headers || {};
    // Extract the Stripe signature. Stripe sends this to prove the request is authentic.
    const sig = headers['stripe-signature'] || headers['Stripe-Signature'];
    
    if (!sig) {
        console.error("No Stripe signature found in headers.");
        return { statusCode: 400, body: "Missing signature" };
    }
    
    let stripeEvent;
    try {
        // Verify call from Stripe
        /* Zero Trust Implementation: We use Stripe's library to re-construct the event.
           If even one character in the body was tampered with, this will fail.
        */
        stripeEvent = stripe.webhooks.constructEvent(
            event.body, 
            sig, 
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Signature verification failed: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    /* --- 2. EVENT FILTERING --- */
    // We only care about successful checkouts. Other events (like refund or failure) are ignored here.
    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        console.log("Processing Session ID:", session.id);

        // Extract customer details captured on Stripe's secure page
        const customerEmail = session.customer_details?.email;
        const customerPhone = session.customer_details?.phone; 
        const totalAmount = session.amount_total / 100; // Stripe provides amounts in cents

        /* 3. DATA RECONSTRUCTION 
           Retrieve the verified userId and items we passed from the ProcessOrder Lambda
        */
        const userId = session.metadata?.userId;
        const minifiedItems = JSON.parse(session.metadata?.cartItems || "[]");
        
        // Transform the shortened metadata keys (n, q, p) back into readable object properties
        const fullItems = minifiedItems.map(item => ({
            productId: item.id,
            name: item.n,
            category: item.c,
            qty: item.q,
            price: item.p
        }));

        const trackingNumber = buildTrackingNumber(`STRIPE-${session.id.slice(-8)}`);
        const shippingAddress = session.metadata?.shippingAddress ? JSON.parse(session.metadata.shippingAddress) : null;
        const subtotal = Number(session.metadata?.subtotal || 0);
        const discountAmount = Number(session.metadata?.discountAmount || 0);
        const discountedSubtotal = Number(session.metadata?.discountedSubtotal || subtotal);
        const taxAmount = Number(session.metadata?.taxAmount || 0);
        const promoCode = String(session.metadata?.promoCode || '').trim();
        const promoDescription = String(session.metadata?.promoDescription || '').trim();

        // Prepare the Order Object for DynamoDB
        const order = {
            orderId: `STRIPE-${session.id.slice(-8)}`, // Create a readable short ID
            userId: userId, // This matches the Cognito 'sub' UUID
            items: fullItems,
            total: totalAmount,
            subtotal,
            discountAmount,
            discountedSubtotal,
            taxAmount,
            promoCode,
            promoDescription,
            status: "PENDING",
            createdAt: new Date().toISOString(),
            trackingNumber,
            statusHistory: [
                {
                    status: "PENDING",
                    updatedAt: new Date().toISOString()
                }
            ],
            email: customerEmail,
            phone: customerPhone,
            shippingAddress
        };

        try {
            /* --- 4. DATABASE --- */
            // Save the finalized order to the 'Orders' table in Dynamodb
            await docClient.send(new PutCommand({
                TableName: process.env.ORDERS_TABLE || "Orders",
                Item: order
            }));
            console.log("Order saved to DynamoDB for user:", userId);

            // 5. TRIGGER NOTIFICATIONS
            // Trigger SES for professional Email Confirmation
            if (customerEmail) {
                console.log(`Sending confirmation email for ${order.orderId} to ${customerEmail} from ${process.env.SES_FROM_ADDRESS}`);
                await ses.send(new SendEmailCommand({
                    Source: process.env.SES_FROM_ADDRESS, 
                    Destination: { ToAddresses: [customerEmail] },
                    Message: {
                        Subject: { Data: `Thanks for your ElectroTech order, ${order.orderId}` },
                        Body: {
                            Html: {
                                Data: buildOrderReceivedHtml(order)
                            },
                            Text: {
                                Data: [
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
                                ].join('\n')
                            }
                        }
                    }
                }));
            }
            // Trigger SNS for SMS Confirmation (if phone provided)
            if (customerPhone) {
                await sns.send(new PublishCommand({
                    Message: `ElectroTech: Order ${order.orderId} received. It is now pending review.`,
                    PhoneNumber: customerPhone 
                }));
            }

        } catch (err) {
            console.error("Error during post-payment processing:", err);
            // We still return 200 to Stripe because we received the event, 
            // but we log the internal failure.
        }
    }
    /* --- 6. STRIPE ACKNOWLEDGEMENT --- */
    // Stripe requires a 200 response to acknowledge receipt
    // Stripe will keep retrying the webhook (causing duplicate orders) if we don't return a 200 OK.
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};