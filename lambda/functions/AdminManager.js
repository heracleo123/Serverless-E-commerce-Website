const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand, AdminListGroupsForUserCommand, AdminRemoveUserFromGroupCommand, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognitoClient = new CognitoIdentityProviderClient({});
const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

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

const buildStatusEmailHtml = (order) => {
    const itemsHtml = (order.items || []).map((item) => `
        <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.qty}</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.price)}</td>
        </tr>
    `).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #18181b;">
            <div style="padding: 24px; border: 1px solid #e5e7eb; border-radius: 20px;">
                <p style="margin: 0 0 8px; color: #e11d48; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;">ElectroTech Order Update</p>
                <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 800;">Status: ${order.status}</h1>
                <p style="margin: 0 0 8px;"><strong>Order Number:</strong> ${order.orderId}</p>
                <p style="margin: 0 0 8px;"><strong>Tracking Number:</strong> ${order.trackingNumber}</p>
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

const listUsers = async () => {
    const result = await cognitoClient.send(new ListUsersCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Limit: 60
    }));

    const users = await Promise.all((result.Users || []).map(async (user) => {
        const groupsResult = await cognitoClient.send(new AdminListGroupsForUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: user.Username
        }));

        const emailAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'email');
        const subAttribute = (user.Attributes || []).find((attribute) => attribute.Name === 'sub');

        return {
            username: user.Username,
            email: emailAttribute?.Value || '',
            sub: subAttribute?.Value || '',
            status: user.UserStatus,
            enabled: user.Enabled,
            groups: (groupsResult.Groups || []).map((group) => group.GroupName),
            isAdmin: (groupsResult.Groups || []).some((group) => group.GroupName === 'Admins')
        };
    }));

    return users.sort((left, right) => left.email.localeCompare(right.email));
};

const listOrders = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: process.env.ORDERS_TABLE
    }));

    return (result.Items || [])
        .filter((order) => !['DELIVERED', 'CANCELLED'].includes(String(order.status || '').toUpperCase()))
        .map((order) => ({
            ...order,
            trackingNumber: buildTrackingNumber(order.orderId, order.trackingNumber)
        }))
        .sort((left, right) => {
            const leftPending = ['PENDING', 'PROCESSING'].includes(String(left.status || '').toUpperCase()) ? 0 : 1;
            const rightPending = ['PENDING', 'PROCESSING'].includes(String(right.status || '').toUpperCase()) ? 0 : 1;
            if (leftPending !== rightPending) {
                return leftPending - rightPending;
            }
            return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
        });
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

    const nextStatus = String(payload.status || existingOrder.status || 'PENDING').trim().toUpperCase();
    const trackingNumber = buildTrackingNumber(orderId, String(payload.trackingNumber || existingOrder.trackingNumber || '').trim());
    const updatedAt = new Date().toISOString();
    const updatedOrder = {
        ...existingOrder,
        status: nextStatus,
        trackingNumber,
        updatedAt,
        statusHistory: [
            ...(existingOrder.statusHistory || []),
            { status: nextStatus, updatedAt }
        ]
    };

    await docClient.send(new PutCommand({
        TableName: process.env.ORDERS_TABLE,
        Item: updatedOrder
    }));

    if (updatedOrder.email) {
        await sesClient.send(new SendEmailCommand({
            Source: process.env.SES_FROM_ADDRESS,
            Destination: { ToAddresses: [updatedOrder.email] },
            Message: {
                Subject: { Data: `ElectroTech order ${updatedOrder.orderId} is now ${nextStatus}` },
                Body: {
                    Html: { Data: buildStatusEmailHtml(updatedOrder) },
                    Text: {
                        Data: [
                            `Order ${updatedOrder.orderId} status updated`,
                            `Status: ${updatedOrder.status}`,
                            `Tracking Number: ${updatedOrder.trackingNumber}`,
                            `Order Total: ${formatCurrency(updatedOrder.total)}`
                        ].join('\n')
                    }
                }
            }
        }));
    }

    return updatedOrder;
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