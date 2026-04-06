const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchGetCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
// Initialize Stripe with the Secret Key from environment variables for security
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const HST_RATE = 0.13;
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Content-Type": "application/json"
};

const roundCurrency = (amount) => Math.round(Number(amount || 0) * 100) / 100;

const normalizeRequestedItems = (items) => {
    const itemMap = new Map();

    for (const item of Array.isArray(items) ? items : []) {
        const productId = String(item.productId || '').trim();
        const qty = Math.max(1, Number(item.qty || 1));

        if (!productId || qty <= 0) {
            continue;
        }

        const current = itemMap.get(productId) || { productId, qty: 0 };
        current.qty += qty;
        itemMap.set(productId, current);
    }

    return Array.from(itemMap.values());
};

const getAuthoritativeItems = async (requestedItems) => {
    const tableName = process.env.PRODUCTS_TABLE || 'Products';
    const result = await docClient.send(new BatchGetCommand({
        RequestItems: {
            [tableName]: {
                Keys: requestedItems.map((item) => ({ productId: item.productId }))
            }
        }
    }));

    const products = result.Responses?.[tableName] || [];
    const productMap = new Map(products.map((product) => [product.productId, product]));

    return requestedItems.map((requestedItem) => {
        const product = productMap.get(requestedItem.productId);

        if (!product) {
            throw new Error(`Product ${requestedItem.productId} is no longer available.`);
        }

        if (Number(product.stock || 0) < requestedItem.qty) {
            throw new Error(`${product.name || requestedItem.productId} only has ${product.stock || 0} left in stock.`);
        }

        return {
            productId: product.productId,
            name: String(product.name || '').trim(),
            category: String(product.category || '').trim(),
            qty: requestedItem.qty,
            price: Number(product.price || 0),
            imageUrl: product.images?.[0] || product.imageUrl || ''
        };
    }).filter((item) => item.productId && item.name && item.price >= 0 && item.qty > 0);
};

const calculateDiscount = (items, promo) => {
    if (!promo || promo.isActive === false || (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now())) {
        return null;
    }

    const applicableItems = items.filter((item) => {
        if (promo.targetType === 'category') {
            return String(item.category || '').toLowerCase() === String(promo.targetValue || '').toLowerCase();
        }

        if (promo.targetType === 'product') {
            return item.productId === promo.targetValue;
        }

        return true;
    });

    const applicableSubtotal = applicableItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if (applicableSubtotal <= 0) {
        return null;
    }

    const rawDiscount = promo.discountType === 'amount'
        ? Number(promo.discountValue || 0)
        : applicableSubtotal * (Number(promo.discountValue || 0) / 100);

    const discountAmount = roundCurrency(Math.min(applicableSubtotal, rawDiscount));
    if (discountAmount <= 0) {
        return null;
    }

    return {
        code: String(promo.code || '').trim().toUpperCase(),
        description: String(promo.description || '').trim(),
        discountType: promo.discountType === 'amount' ? 'amount' : 'percentage',
        discountValue: Number(promo.discountValue || 0),
        targetType: promo.targetType || 'all',
        targetValue: String(promo.targetValue || '').trim(),
        discountAmount,
        applicableProductIds: applicableItems.map((item) => item.productId)
    };
};

const buildStripeLineItems = (items, appliedPromo) => {
    const discountCents = Math.round(Number(appliedPromo?.discountAmount || 0) * 100);
    const applicableIds = new Set(appliedPromo?.applicableProductIds || []);
    const applicableItems = items.filter((item) => applicableIds.has(item.productId));
    const applicableSubtotalCents = applicableItems.reduce((sum, item) => sum + (Math.round(item.price * 100) * item.qty), 0);
    let remainingDiscountCents = discountCents;
    const lastApplicableItemId = applicableItems[applicableItems.length - 1]?.productId;

    return items.map((item) => {
        const originalUnitAmount = Math.round(item.price * 100);
        let lineDiscountCents = 0;

        if (discountCents > 0 && applicableIds.has(item.productId) && applicableSubtotalCents > 0) {
            if (item.productId === lastApplicableItemId) {
                lineDiscountCents = remainingDiscountCents;
            } else {
                const itemSubtotalCents = originalUnitAmount * item.qty;
                lineDiscountCents = Math.floor((itemSubtotalCents / applicableSubtotalCents) * discountCents);

                if (remainingDiscountCents - lineDiscountCents < 0) {
                    lineDiscountCents = remainingDiscountCents;
                }
                remainingDiscountCents -= lineDiscountCents;
            }
        }

        const adjustedSubtotalCents = Math.max(0, (originalUnitAmount * item.qty) - lineDiscountCents);
        const adjustedUnitAmount = Math.max(0, Math.round(adjustedSubtotalCents / item.qty));

        return {
            price_data: {
                currency: 'cad',
                product_data: {
                    name: item.name,
                },
                unit_amount: adjustedUnitAmount,
            },
            quantity: item.qty,
        };
    });
};

const normalizeAddress = (address) => {
    if (!address || typeof address !== 'object') {
        return null;
    }

    const normalizedAddress = {
        id: String(address.id || '').trim() || 'default-address',
        label: String(address.label || 'Shipping Address').trim(),
        fullName: String(address.fullName || '').trim(),
        line1: String(address.line1 || '').trim(),
        line2: String(address.line2 || '').trim(),
        city: String(address.city || '').trim(),
        province: String(address.province || '').trim(),
        postalCode: String(address.postalCode || '').trim(),
        country: String(address.country || 'Canada').trim()
    };

    if (!normalizedAddress.fullName || !normalizedAddress.line1 || !normalizedAddress.city || !normalizedAddress.province || !normalizedAddress.postalCode) {
        return null;
    }

    return normalizedAddress;
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

exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        /* --- 1. SECURE IDENTITY CHECK --- */
        // Do not trust the User ID from the frontend body. 
        // Pull the 'sub' (UUID) and 'email' directly from the Cognito claims.
        const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const headerClaims = decodeJwtPayload(token) || {};
        const requestClaims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
        const authenticatedUserId = requestClaims.sub || headerClaims.sub;
        const userEmail = requestClaims.email || headerClaims.email;

        if (!authenticatedUserId) {
            return { 
                statusCode: 401, 
                headers,
                body: JSON.stringify({ message: "Unauthorized" }) 
            };
        }

        const body = JSON.parse(event.body || '{}');
        const requestedItems = normalizeRequestedItems(body.items);
        const promoCode = String(body.promoCode || '').trim().toUpperCase();
        const shippingAddress = normalizeAddress(body.shippingAddress);

        if (requestedItems.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'At least one item is required.' })
            };
        }

        const items = await getAuthoritativeItems(requestedItems);

        let appliedPromo = null;
        if (promoCode) {
            const promoResult = await docClient.send(new GetCommand({
                TableName: process.env.PROMO_CODES_TABLE,
                Key: { code: promoCode }
            }));

            if (!promoResult.Item || promoResult.Item.isActive === false) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Promo code is invalid or inactive.' })
                };
            }

            appliedPromo = calculateDiscount(items, promoResult.Item);

            if (!appliedPromo) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ message: 'Promo code does not apply to the selected items.' })
                };
            }
        }

        /* --- 2. DATA MINIFICATION --- */
        // Stripe has a 500-character limit for metadata strings.
        // Shrink cart data (e.g., changing 'name' to 'n') to ensure it fits.
        const simplifiedItems = items.map(item => ({
            id: item.productId,
            n: item.name.substring(0, 20), // Truncate name to save space
            c: String(item.category || '').substring(0, 20),
            q: item.qty,
            p: item.price
        }));
        const subtotal = roundCurrency(items.reduce((sum, item) => sum + (item.price * item.qty), 0));
        const discountAmount = appliedPromo?.discountAmount || 0;
        const discountedSubtotal = roundCurrency(Math.max(0, subtotal - discountAmount));
        const subtotalCents = Math.round(discountedSubtotal * 100);
        const taxCents = Math.round(discountedSubtotal * HST_RATE * 100);
        const stripeLineItems = buildStripeLineItems(items, appliedPromo);

        if (taxCents > 0) {
            stripeLineItems.push({
                price_data: {
                    currency: 'cad',
                    product_data: {
                        name: 'GST/HST (13%)',
                    },
                    unit_amount: taxCents,
                },
                quantity: 1,
            });
        }

        /* --- 3. STRIPE SESSION CREATION --- */
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: stripeLineItems,
            mode: 'payment',
            // Redirect URLs back to our frontend based on the result
            success_url: `${process.env.FRONTEND_URL}?success=true`,
            cancel_url: `${process.env.FRONTEND_URL}?canceled=true`,

            /* --- 4. PERSISTENCE VIA METADATA --- */
            // We "hide" our app data here so the Stripe Webhook can read it later
            metadata: {
                // Use the verified IDs from Cognito
                userId: authenticatedUserId,
                email: userEmail, 
                cartItems: JSON.stringify(simplifiedItems),
                subtotal: subtotal.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                discountedSubtotal: discountedSubtotal.toFixed(2),
                taxAmount: (taxCents / 100).toFixed(2),
                promoCode: appliedPromo?.code || '',
                promoDescription: appliedPromo?.description || '',
                shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : ''
            },
            customer_email: userEmail, // Pre-fills the Stripe email field for the user
            phone_number_collection: {
                enabled: true, // Enables SMS fulfillment later via SNS
            },
        });

        /* --- 5. REDIRECT RESPONSE --- */
        return {
            statusCode: 200,
            headers,
            // Send back the Stripe URL for the React app to navigate to
            body: JSON.stringify({ 
                url: session.url,
                subtotal,
                discountAmount,
                discountedSubtotal,
                taxAmount: roundCurrency(taxCents / 100),
                total: roundCurrency(discountedSubtotal + (taxCents / 100)),
                appliedPromo
            })
        };
    } catch (err) {
        console.error("Stripe Session Error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: "Unable to process checkout. Please try again."
            })
        };
    }
};