const Stripe = require('stripe');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand, AdminListGroupsForUserCommand, AdminRemoveUserFromGroupCommand, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityProviderClient({});
const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });
const ADULT_AGE_YEARS = 18;
const TRACKING_STATUSES = new Set(['SHIPPED', 'DELIVERED']);

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
    return {
        claims: { ...headerClaims, ...requestClaims },
        groups: String(requestClaims['cognito:groups'] || headerClaims['cognito:groups'] || '').split(',').filter(Boolean)
    };
};

const ensureAdmin = (event) => {
    const { claims, groups } = getClaims(event);
    const isAdmin = groups.includes('Admins');

    if (!claims.sub || !isAdmin) {
        return null;
    }

    return claims;
};

const formatCurrency = (amount) => new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
}).format(Number(amount || 0));

const serializeAdminOrder = (order) => ({
    ...order,
    orderNumber: String(order.orderId || '').trim(),
    trackingNumber: getTrackingNumberForStatus(order.orderId, order.status, order.trackingNumber),
    refundReference: String(order.refundReference || order.refundId || '').trim(),
});

const isPromoActive = (promo) => {
    if (!promo || promo.isActive === false) {
        return false;
    }

    if (!promo.expiresAt) {
        return true;
    }

    return new Date(promo.expiresAt).getTime() >= Date.now();
};

const getSuperAdminIdentity = () => String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();

const isSuperAdminUser = (claims = {}) => {
    const superAdminEmail = getSuperAdminIdentity();
    return Boolean(superAdminEmail) && String(claims.email || claims['cognito:username'] || '').trim().toLowerCase() === superAdminEmail;
};

const buildTrackingNumber = (orderId, existingTrackingNumber) => {
    if (existingTrackingNumber) {
        return existingTrackingNumber;
    }

    const compactOrderId = String(orderId || 'ORDER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `ET-${compactOrderId.slice(-12).padStart(12, '0')}`;
};

const normalizeOrderStatus = (status) => String(status || 'PENDING').trim().toUpperCase();

const shouldIncludeTracking = (status) => TRACKING_STATUSES.has(normalizeOrderStatus(status));

const getTrackingNumberForStatus = (orderId, status, existingTrackingNumber) => {
    const currentTrackingNumber = String(existingTrackingNumber || '').trim();
    if (currentTrackingNumber) {
        return currentTrackingNumber;
    }

    return shouldIncludeTracking(status) ? buildTrackingNumber(orderId) : '';
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
    const normalizedDisplayName = String(displayName || '').trim().slice(0, 50);
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

const normalizeBirthDate = (birthDate) => {
    const normalized = String(birthDate || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

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

const applyInventoryChange = async (items, direction) => {
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
                ConditionExpression: direction === 'reserve'
                    ? 'attribute_exists(productId) AND stock >= :requiredQty'
                    : 'attribute_exists(productId)',
                ExpressionAttributeValues: direction === 'reserve'
                    ? {
                        ':delta': -item.qty,
                        ':requiredQty': item.qty,
                        ':updatedAt': updatedAt,
                    }
                    : {
                        ':delta': item.qty,
                        ':updatedAt': updatedAt,
                    }
            }
        }))
    }));
};

const STATUS_EMAIL_COPY = {
    PENDING: {
        subject: 'We got your order and we are on it',
        headline: 'Your order is officially in the queue',
        intro: 'Good news. Your order is locked in and our team is getting everything lined up behind the scenes.',
        detail: 'We will send another update as soon as it moves into the next step.',
    },
    PROCESSING: {
        subject: 'Your order is getting packed up',
        headline: 'The team is putting your order together',
        intro: 'We are pulling your items, checking everything over, and getting the box ready to go.',
        detail: 'As soon as it ships, we will send your tracking details right away.',
    },
    SHIPPED: {
        subject: 'Your order is on the move',
        headline: 'Your order just shipped',
        intro: 'Your package is out the door and headed your way. This is the fun update.',
        detail: 'You can use the tracking number below to follow the trip.',
    },
    DELIVERED: {
        subject: 'Your order has arrived',
        headline: 'Your delivery should be with you now',
        intro: 'Your order shows as delivered. Time to unbox something good.',
        detail: 'If anything looks off, reply with your order number and we will jump in.',
    },
    CANCELLED: {
        subject: 'Your order was cancelled and refunded',
        headline: 'Your cancellation is complete',
        intro: 'We cancelled the order and reversed the charge back to the card on file.',
        detail: 'Banks can take a few business days to show the refund, but the reversal has been sent from our side.',
    },
    DEFAULT: {
        subject: 'There is a fresh update on your order',
        headline: 'Your order has a new update',
        intro: 'We wanted to send a quick heads-up so you are not left guessing.',
        detail: 'Check the latest status below for the current snapshot.',
    },
};

const getStatusEmailCopy = (status) => STATUS_EMAIL_COPY[normalizeOrderStatus(status)] || STATUS_EMAIL_COPY.DEFAULT;

const buildStatusEmailHtml = (order) => {
    const emailCopy = getStatusEmailCopy(order.status);
    const itemsHtml = (order.items || []).map((item) => `
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.qty}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.price)}</td>
        </tr>
    `).join('');
    const trackingMarkup = order.trackingNumber
        ? `<p style="margin: 0 0 8px;"><strong>Tracking Number:</strong> ${order.trackingNumber}</p>`
        : '<p style="margin: 0 0 8px; color: #52525b;">Tracking will be shared as soon as the package is with the carrier.</p>';
    const refundMarkup = normalizeOrderStatus(order.status) === 'CANCELLED'
        ? `
            <p style="margin: 0 0 8px;"><strong>Refund Amount:</strong> ${formatCurrency(order.refundAmount || order.total)}</p>
            <p style="margin: 0 0 8px;"><strong>Refund Reference:</strong> ${order.refundId || 'Submitted to Stripe'}</p>
          `
        : '';

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #18181b;">
            <div style="padding: 24px; border: 1px solid #e5e7eb; border-radius: 20px;">
                <p style="margin: 0 0 8px; color: #e11d48; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">ElectroTech Order Update</p>
                <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 800;">${emailCopy.headline}</h1>
                <p style="margin: 0 0 12px; color: #52525b;">${emailCopy.intro}</p>
                <p style="margin: 0 0 20px; color: #52525b;">${emailCopy.detail}</p>
                <p style="margin: 0 0 8px;"><strong>Order Number:</strong> ${order.orderId}</p>
                <p style="margin: 0 0 8px;"><strong>Status:</strong> ${normalizeOrderStatus(order.status)}</p>
                ${trackingMarkup}
                ${refundMarkup}
                <p style="margin: 0 0 24px;"><strong>Updated:</strong> ${order.updatedAt ? new Date(order.updatedAt).toLocaleString('en-CA') : new Date().toLocaleString('en-CA')}</p>
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
                <p style="margin: 0; font-size: 18px;"><strong>Order Total:</strong> ${formatCurrency(order.total)}</p>
            </div>
        </div>
    `;
};

const buildStatusEmailText = (order) => {
    const emailCopy = getStatusEmailCopy(order.status);

    return [
        emailCopy.headline,
        '',
        emailCopy.intro,
        emailCopy.detail,
        '',
        `Order Number: ${order.orderId}`,
        `Status: ${normalizeOrderStatus(order.status)}`,
        ...(order.trackingNumber ? [`Tracking Number: ${order.trackingNumber}`] : ['Tracking: We will share it as soon as the carrier scans your package.']),
        ...(normalizeOrderStatus(order.status) === 'CANCELLED' ? [
            `Refund Amount: ${formatCurrency(order.refundAmount || order.total)}`,
            `Refund Reference: ${order.refundId || 'Submitted to Stripe'}`,
            'The reversal has been sent back to the card on file.'
        ] : []),
        `Order Total: ${formatCurrency(order.total)}`,
    ].join('\n');
};

const sendStatusEmail = async (order) => {
    if (!order.email) {
        return;
    }

    const emailCopy = getStatusEmailCopy(order.status);
    await sesClient.send(new SendEmailCommand({
        Source: process.env.SES_FROM_ADDRESS,
        Destination: { ToAddresses: [order.email] },
        Message: {
            Subject: { Data: `ElectroTech: ${emailCopy.subject}` },
            Body: {
                Html: { Data: buildStatusEmailHtml(order) },
                Text: { Data: buildStatusEmailText(order) },
            }
        }
    }));
};

const getOrderCreatedAtEpoch = (order) => {
    const parsed = Date.parse(String(order.createdAt || '').trim());
    return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
};

const checkoutSessionMatchesOrder = (session, order) => {
    const orderSuffix = String(order.orderId || '').trim().replace(/^STRIPE-/i, '');
    const sessionId = String(session?.id || '').trim();
    const sessionEmail = String(session?.customer_details?.email || session?.customer_email || '').trim().toLowerCase();
    const orderEmail = String(order.email || '').trim().toLowerCase();
    const sessionAmount = Number(session?.amount_total || 0) / 100;
    const orderTotal = Number(order.total || 0);

    return Boolean(
        sessionId
        && orderSuffix
        && sessionId.endsWith(orderSuffix)
        && (!orderEmail || !sessionEmail || sessionEmail === orderEmail)
        && Math.abs(sessionAmount - orderTotal) < 0.01
    );
};

const resolveRefundPaymentReference = async (order) => {
    const existingPaymentIntentId = String(order.paymentIntentId || '').trim();
    const existingCheckoutSessionId = String(order.checkoutSessionId || '').trim();

    if (existingPaymentIntentId) {
        return {
            paymentIntentId: existingPaymentIntentId,
            checkoutSessionId: existingCheckoutSessionId,
        };
    }

    if (existingCheckoutSessionId) {
        const session = await stripe.checkout.sessions.retrieve(existingCheckoutSessionId);
        const paymentIntentId = String(session?.payment_intent?.id || session?.payment_intent || '').trim();
        if (paymentIntentId) {
            return {
                paymentIntentId,
                checkoutSessionId: String(session.id || existingCheckoutSessionId).trim(),
            };
        }
    }

    const createdAtEpoch = getOrderCreatedAtEpoch(order);
    const createdRange = createdAtEpoch
        ? { gte: Math.max(0, createdAtEpoch - 86400), lte: createdAtEpoch + 86400 }
        : undefined;
    const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        ...(createdRange ? { created: createdRange } : {}),
    });

    const matchedSession = (sessions.data || []).find((session) => checkoutSessionMatchesOrder(session, order));
    const matchedPaymentIntentId = String(matchedSession?.payment_intent?.id || matchedSession?.payment_intent || '').trim();

    if (matchedSession?.id && matchedPaymentIntentId) {
        return {
            paymentIntentId: matchedPaymentIntentId,
            checkoutSessionId: String(matchedSession.id || '').trim(),
        };
    }

    throw new Error('Unable to reverse the charge because the Stripe payment reference could not be recovered for this order.');
};

const refundOrderPayment = async (order) => {
    const paymentReference = await resolveRefundPaymentReference(order);
    const paymentIntentId = paymentReference.paymentIntentId;

    let refund;

    try {
        refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: {
                orderId: String(order.orderId || ''),
            },
        });
    } catch (error) {
        if (error?.code !== 'charge_already_refunded') {
            throw error;
        }

        const refunds = await stripe.refunds.list({
            payment_intent: paymentIntentId,
            limit: 1,
        });

        refund = refunds.data?.[0];
        if (!refund) {
            throw error;
        }
    }

    return {
        paymentIntentId,
        checkoutSessionId: paymentReference.checkoutSessionId,
        refundId: refund.id,
        refundStatus: refund.status,
        refundAmount: Number(refund.amount || 0) / 100,
        refundedAt: new Date().toISOString(),
    };
};

const listUsers = async () => {
    const [profilesResult, ordersResult, usersResult] = await Promise.all([
        docClient.send(new ScanCommand({ TableName: process.env.USER_PROFILES_TABLE })),
        docClient.send(new ScanCommand({ TableName: process.env.ORDERS_TABLE })),
        cognitoClient.send(new ListUsersCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Limit: 60
        }))
    ]);

    const profilesByUserId = new Map((profilesResult.Items || []).map((profile) => [profile.userId, profile]));
    const orderSummaryByUserId = new Map();

    for (const order of ordersResult.Items || []) {
        const userId = String(order.userId || '').trim();
        if (!userId) {
            continue;
        }

        const current = orderSummaryByUserId.get(userId) || { orderCount: 0, lifetimeSpend: 0, lastOrderAt: '' };
        current.orderCount += 1;
        current.lifetimeSpend += Number(order.total || 0);
        current.lastOrderAt = String(order.createdAt || '') > current.lastOrderAt ? String(order.createdAt || '') : current.lastOrderAt;
        orderSummaryByUserId.set(userId, current);
    }

    const users = await Promise.all((usersResult.Users || []).map(async (user) => {
        const groupsResult = await cognitoClient.send(new AdminListGroupsForUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: user.Username
        }));

        const emailAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'email');
        const givenNameAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'given_name');
        const familyNameAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'family_name');
        const nameAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'name');
        const subAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'sub');
        const profile = profilesByUserId.get(subAttribute?.Value || '') || {};
        const orderSummary = orderSummaryByUserId.get(subAttribute?.Value || '') || { orderCount: 0, lifetimeSpend: 0, lastOrderAt: '' };

        return {
            username: user.Username,
            email: emailAttribute?.Value || '',
            sub: subAttribute?.Value || '',
            status: user.UserStatus,
            enabled: user.Enabled,
            groups: (groupsResult.Groups || []).map((group) => group.GroupName),
            isAdmin: (groupsResult.Groups || []).some((group) => group.GroupName === 'Admins'),
            profile: {
                username: resolveStoredPublicName(profile.username, profile.displayName),
                displayName: resolvePreferredDisplayName({
                    displayName: profile.displayName,
                    username: profile.username,
                    addresses: profile.addresses,
                    email: emailAttribute?.Value || '',
                    givenName: givenNameAttribute?.Value || '',
                    familyName: familyNameAttribute?.Value || '',
                    fullName: nameAttribute?.Value || '',
                }),
                photoUrl: String(profile.photoUrl || '').trim(),
                birthDate: normalizeBirthDate(profile.birthDate),
                addressCount: Array.isArray(profile.addresses) ? profile.addresses.length : 0,
            },
            orderCount: orderSummary.orderCount,
            lifetimeSpend: Math.round(orderSummary.lifetimeSpend * 100) / 100,
            lastOrderAt: orderSummary.lastOrderAt,
        };
    }));

    return users.sort((left, right) => left.email.localeCompare(right.email));
};

const listOrders = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: process.env.ORDERS_TABLE
    }));

    return (result.Items || [])
        .map((order) => serializeAdminOrder(order))
        .sort((left, right) => {
            const statusRank = {
                PENDING: 0,
                PROCESSING: 1,
                SHIPPED: 2,
                DELIVERED: 3,
                CANCELLED: 4,
            };
            const leftRank = statusRank[normalizeOrderStatus(left.status)] ?? 99;
            const rightRank = statusRank[normalizeOrderStatus(right.status)] ?? 99;
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
        });
};

const getUserDetail = async (userId) => {
    if (!userId) {
        throw new Error('userId is required.');
    }

    const [profileResult, ordersResult] = await Promise.all([
        docClient.send(new GetCommand({
            TableName: process.env.USER_PROFILES_TABLE,
            Key: { userId }
        })),
        docClient.send(new QueryCommand({
            TableName: process.env.ORDERS_TABLE,
            IndexName: 'userId-index',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId
            },
            ScanIndexForward: false
        }))
    ]);

    return {
        profile: {
            userId,
            email: String(profileResult.Item?.email || '').trim(),
            username: resolveStoredPublicName(profileResult.Item?.username, profileResult.Item?.displayName),
            displayName: resolvePreferredDisplayName({
                displayName: profileResult.Item?.displayName,
                username: profileResult.Item?.username,
                addresses: profileResult.Item?.addresses,
                email: profileResult.Item?.email,
            }),
            photoUrl: String(profileResult.Item?.photoUrl || '').trim(),
            birthDate: normalizeBirthDate(profileResult.Item?.birthDate),
            addresses: Array.isArray(profileResult.Item?.addresses) ? profileResult.Item.addresses : [],
            defaultAddressId: profileResult.Item?.defaultAddressId || null,
            createdAt: profileResult.Item?.createdAt || null,
            updatedAt: profileResult.Item?.updatedAt || null,
        },
        orders: (ordersResult.Items || []).map((order) => serializeAdminOrder(order))
    };
};

const saveUserProfile = async (payload) => {
    const userId = String(payload.userId || '').trim();
    if (!userId) {
        throw new Error('userId is required.');
    }

    const existingProfileResult = await docClient.send(new GetCommand({
        TableName: process.env.USER_PROFILES_TABLE,
        Key: { userId }
    }));

    const existingProfile = existingProfileResult.Item || {};
    const displayName = String(payload.profile?.displayName || '').trim().slice(0, 50);
    const username = displayName ? normalizeUsername(displayName) : '';
    await ensureUniqueUsername(userId, username);
    const addresses = normalizeAddresses(payload.profile?.addresses);
    const defaultAddressId = addresses.some((address) => address.id === payload.profile?.defaultAddressId)
        ? payload.profile.defaultAddressId
        : addresses[0]?.id || null;

    const profile = {
        userId,
        email: String(payload.profile?.email || existingProfile.email || '').trim(),
        username,
        displayName,
        photoUrl: String(payload.profile?.photoUrl || existingProfile.photoUrl || '').trim(),
        addresses,
        defaultAddressId,
        birthDate: validateAdultBirthDate(payload.profile?.birthDate),
        createdAt: existingProfile.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
        TableName: process.env.USER_PROFILES_TABLE,
        Item: profile
    }));

    return getUserDetail(userId);
};

const listPromos = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: process.env.PROMO_CODES_TABLE
    }));

    return (result.Items || [])
        .map((promo) => ({
            ...promo,
            isCurrentlyAvailable: isPromoActive(promo)
        }))
        .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
};

const savePromo = async (promoInput) => {
    const code = String(promoInput.code || '').trim().toUpperCase();
    if (!code) {
        throw new Error('Promo code is required.');
    }

    const targetType = ['all', 'category', 'product'].includes(promoInput.targetType) ? promoInput.targetType : 'all';
    const targetValue = String(promoInput.targetValue || '').trim();

    if ((targetType === 'category' || targetType === 'product') && !targetValue) {
        throw new Error(`A ${targetType} target value is required.`);
    }

    const now = new Date().toISOString();
    const existingPromo = await docClient.send(new GetCommand({
        TableName: process.env.PROMO_CODES_TABLE,
        Key: { code }
    }));

    const promo = {
        code,
        description: String(promoInput.description || '').trim(),
        discountType: promoInput.discountType === 'amount' ? 'amount' : 'percentage',
        discountValue: Number(promoInput.discountValue || 0),
        targetType,
        targetValue: targetType === 'all' ? '' : targetValue,
        isActive: promoInput.isActive !== false,
        expiresAt: promoInput.expiresAt ? new Date(`${promoInput.expiresAt}T23:59:59.999Z`).toISOString() : null,
        updatedAt: now,
        createdAt: existingPromo.Item?.createdAt || now
    };

    if (promo.discountValue <= 0) {
        throw new Error('Discount value must be greater than zero.');
    }

    await docClient.send(new PutCommand({
        TableName: process.env.PROMO_CODES_TABLE,
        Item: promo
    }));

    return promo;
};

const deletePromo = async (code) => {
    await docClient.send(new DeleteCommand({
        TableName: process.env.PROMO_CODES_TABLE,
        Key: { code: String(code || '').trim().toUpperCase() }
    }));
};

const promoteUser = async (username) => {
    await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
        GroupName: 'Admins'
    }));
};

const demoteUser = async (username) => {
    await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
        GroupName: 'Admins'
    }));
};

const updateOrderStatus = async (payload) => {
    const orderId = payload.orderId;
    const createdAt = payload.createdAt;

    if (!orderId || !createdAt) {
        throw new Error('orderId and createdAt are required.');
    }

    const existingOrderResult = await docClient.send(new GetCommand({
        TableName: process.env.ORDERS_TABLE,
        Key: { orderId, createdAt }
    }));

    const existingOrder = existingOrderResult.Item;
    if (!existingOrder) {
        throw new Error('Order not found.');
    }

    const previousStatus = normalizeOrderStatus(existingOrder.status);
    const nextStatus = normalizeOrderStatus(payload.status || existingOrder.status || 'PENDING');
    const trackingNumber = getTrackingNumberForStatus(orderId, nextStatus, String(payload.trackingNumber || existingOrder.trackingNumber || '').trim());
    const updatedAt = new Date().toISOString();
    const currentlyCommitted = existingOrder.inventoryCommitted === true;
    const shouldCommitInventory = nextStatus !== 'CANCELLED';
    let refundMetadata = {};

    if (nextStatus === 'CANCELLED' && previousStatus !== 'CANCELLED') {
        refundMetadata = await refundOrderPayment(existingOrder);
    }

    if (currentlyCommitted && !shouldCommitInventory) {
        await applyInventoryChange(existingOrder.items, 'release');
    }

    if (!currentlyCommitted && shouldCommitInventory) {
        await applyInventoryChange(existingOrder.items, 'reserve');
    }

    const updatedOrder = {
        ...existingOrder,
        status: nextStatus,
        trackingNumber,
        updatedAt,
        inventoryCommitted: shouldCommitInventory,
        ...refundMetadata,
        statusHistory: [
            ...(existingOrder.statusHistory || []),
            { status: nextStatus, updatedAt }
        ]
    };

    await docClient.send(new PutCommand({
        TableName: process.env.ORDERS_TABLE,
        Item: updatedOrder
    }));

    await sendStatusEmail(updatedOrder);

    return serializeAdminOrder(updatedOrder);
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const claims = ensureAdmin(event);
    if (!claims) {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'Admin access required.' })
        };
    }

    const adminContext = {
        ...claims,
        isSuperAdmin: isSuperAdminUser(claims)
    };

    try {
        if (event.httpMethod === 'GET') {
            const entity = String(event.queryStringParameters?.entity || '').trim();

            if (entity === 'orders') {
                return { statusCode: 200, headers, body: JSON.stringify(await listOrders()) };
            }

            if (entity === 'users') {
                const users = await listUsers();
                const superAdminEmail = getSuperAdminIdentity();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(users.map((user) => ({
                        ...user,
                        isSuperAdmin: Boolean(superAdminEmail) && String(user.email || user.username || '').toLowerCase() === superAdminEmail
                    })))
                };
            }

            if (entity === 'user-detail') {
                return { statusCode: 200, headers, body: JSON.stringify(await getUserDetail(String(event.queryStringParameters?.userId || '').trim())) };
            }

            if (entity === 'promos') {
                return { statusCode: 200, headers, body: JSON.stringify(await listPromos()) };
            }

            return { statusCode: 400, headers, body: JSON.stringify({ message: 'Unknown admin entity.' }) };
        }

        if (event.httpMethod === 'POST') {
            const payload = JSON.parse(event.body || '{}');
            const entity = payload.entity;
            const action = payload.action;

            if (entity === 'promos' && action === 'save') {
                return { statusCode: 200, headers, body: JSON.stringify(await savePromo(payload.promo || {})) };
            }

            if (entity === 'promos' && action === 'delete') {
                await deletePromo(payload.code);
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'Promo deleted.' }) };
            }

            if (entity === 'users' && action === 'promote') {
                if (!adminContext.isSuperAdmin) {
                    return { statusCode: 403, headers, body: JSON.stringify({ message: 'Only the superadmin can promote admins.' }) };
                }
                await promoteUser(payload.username);
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'User promoted to admin.' }) };
            }

            if (entity === 'users' && action === 'demote') {
                if (!adminContext.isSuperAdmin) {
                    return { statusCode: 403, headers, body: JSON.stringify({ message: 'Only the superadmin can demote admins.' }) };
                }
                await demoteUser(payload.username);
                return { statusCode: 200, headers, body: JSON.stringify({ message: 'Admin access removed.' }) };
            }

            if (entity === 'users' && action === 'save-profile') {
                return { statusCode: 200, headers, body: JSON.stringify(await saveUserProfile(payload)) };
            }

            if (entity === 'orders' && action === 'update-status') {
                return { statusCode: 200, headers, body: JSON.stringify(await updateOrderStatus(payload)) };
            }

            return { statusCode: 400, headers, body: JSON.stringify({ message: 'Unknown admin action.' }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        console.error('Admin manager error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Admin request failed.' })
        };
    }
};