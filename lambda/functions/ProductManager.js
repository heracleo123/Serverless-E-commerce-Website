const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const TABLE_NAME = "Products"; 

const decodeJwtPayload = (token) => {
    if (!token) return {};

    try {
        const [, payload] = token.split('.');
        if (!payload) return {};

        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch (error) {
        console.error('JWT decode failed:', error);
        return {};
    }
};

const getAdminClaims = (event) => {
    const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const headerClaims = decodeJwtPayload(token);
    const requestClaims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    const claims = { ...headerClaims, ...requestClaims };
    const rawGroups = claims['cognito:groups'] || claims.groups || '';
    const groups = Array.isArray(rawGroups)
        ? rawGroups
        : String(rawGroups)
            .split(',')
            .map((group) => group.trim())
            .filter(Boolean);

    return { claims, groups };
};

const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const extractBase64 = (dataUrl) => {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    return match ? match[2] : dataUrl;
};

const normalizeImageList = (images, fallbackImageUrl) => {
    const normalizedImages = Array.isArray(images)
        ? [...new Set(images.filter(Boolean))].slice(0, 5)
        : [];

    if (normalizedImages.length > 0) {
        return normalizedImages;
    }

    return fallbackImageUrl ? [fallbackImageUrl] : [];
};

const extractIncomingImageFiles = (item) => {
    if (Array.isArray(item.imageFiles) && item.imageFiles.length > 0) {
        return item.imageFiles.slice(0, 5);
    }

    if (item.imageFileData && item.imageFileName) {
        return [{
            fileData: item.imageFileData,
            fileName: item.imageFileName,
            fileType: item.imageFileType
        }];
    }

    return [];
};

const uploadImage = async (fileName, fileType, fileData) => {
    if (!process.env.S3_BUCKET || !fileName || !fileData) return null;
    const sanitized = sanitizeFileName(fileName);
    const key = `images/${Date.now()}-${sanitized}`;
    const body = Buffer.from(extractBase64(fileData), 'base64');

    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: fileType || 'application/octet-stream'
    }));

    return key;
};

const uploadImages = async (imageFiles) => {
    const uploadedKeys = await Promise.all(
        imageFiles.map(async (imageFile) => {
            const uploadedKey = await uploadImage(imageFile.fileName, imageFile.fileType, imageFile.fileData);
            return uploadedKey ? `${process.env.CDN_URL}/${uploadedKey}` : null;
        })
    );

    return uploadedKeys.filter(Boolean);
};

exports.handler = async (event) => {
    // 1. Extract request details
    const { httpMethod, body, pathParameters } = event;
    
    /* --- 2. ROLE-BASED ACCESS CONTROL (RBAC) --- */
    // Check the token's 'cognito:groups' claim.
    // If the user isn't in the "Admins" group, block their write/delete requests.
    const { groups, claims } = getAdminClaims(event);
    const isAdmin = groups.includes("Admins");

    // 3. UNIFIED CORS HEADERS
    // Required for the Admin Dashboard to communicate with this API
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
    };

    try {
        console.log('ProductManager request:', JSON.stringify({
            method: httpMethod,
            pathParameters,
            isAdmin,
            username: claims.email || claims['cognito:username'] || claims.sub || 'unknown'
        }));

        // Handle browser preflight checks
        if (httpMethod === "OPTIONS") {
            return { statusCode: 200, headers, body: "" };
        }

        /* --- 4. MULTI-METHOD ROUTING (CRUD) --- */
        switch (httpMethod) {
            case "GET":
                // READ: Fetch all products for the dashboard
                const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
                return { statusCode: 200, headers, body: JSON.stringify(data.Items) };

            case "POST":
                // CREATE: Add a new product (Admin Only)
                if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ message: "Admin Only" }) };
                
                const newProduct = JSON.parse(body);
                // Auto-generate ID if missing to prevent primary key collisions
                if (!newProduct.productId) newProduct.productId = `prod_${Date.now()}`;

                const uploadedImages = await uploadImages(extractIncomingImageFiles(newProduct));
                const finalImages = normalizeImageList([
                    ...normalizeImageList(newProduct.images, newProduct.imageUrl),
                    ...uploadedImages
                ]);
                
                // DATA SANITIZATION: Force correct types before saving to DynamoDB
                const postItem = {
                    ...newProduct,
                    images: finalImages,
                    imageUrl: finalImages[0],
                    price: parseFloat(newProduct.price || 0),
                    stock: parseInt(newProduct.stock || 0, 10),
                    isFeatured: newProduct.isFeatured === true || newProduct.isFeatured === "true"
                };

                delete postItem.imageFiles;
                delete postItem.imageFileData;
                delete postItem.imageFileName;
                delete postItem.imageFileType;
                if (!postItem.imageUrl) delete postItem.imageUrl;
                if (!postItem.images || postItem.images.length === 0) delete postItem.images;
                
                await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: postItem }));
                return { statusCode: 201, headers, body: JSON.stringify(postItem) };

            case "PUT":
                // UPDATE: Modify existing product details (Admin Only)
                if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ message: "Admin Only" }) };
                
                // Flexible ID check (handles {productId} or {id} in API Gateway)
                const idToUpdate = pathParameters?.productId || pathParameters?.id;
                if (!idToUpdate) throw new Error("Missing productId in path parameters");

                const updatedData = JSON.parse(body);

                const updatedUploadedImages = await uploadImages(extractIncomingImageFiles(updatedData));
                const finalUpdatedImages = normalizeImageList([
                    ...normalizeImageList(updatedData.images, updatedData.imageUrl),
                    ...updatedUploadedImages
                ]);
                
                // Format the item to ensure correct DynamoDB types and keep ID consistent
                const putItem = {
                    ...updatedData,
                    productId: idToUpdate, 
                    images: finalUpdatedImages,
                    imageUrl: finalUpdatedImages[0],
                    price: parseFloat(updatedData.price || 0),
                    stock: parseInt(updatedData.stock || 0, 10),
                    isFeatured: updatedData.isFeatured === true || updatedData.isFeatured === "true"
                };

                delete putItem.imageFiles;
                delete putItem.imageFileData;
                delete putItem.imageFileName;
                delete putItem.imageFileType;
                if (!putItem.imageUrl) delete putItem.imageUrl;
                if (!putItem.images || putItem.images.length === 0) delete putItem.images;

                await docClient.send(new PutCommand({ 
                    TableName: TABLE_NAME, 
                    Item: putItem 
                }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Updated", id: idToUpdate }) };

            case "DELETE":
                // DELETE: Remove product from catalog (Admin Only)
                if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ message: "Admin Only" }) };
                
                const deleteId = pathParameters?.productId || pathParameters?.id;
                if (!deleteId) throw new Error("Missing productId for deletion");

                await docClient.send(new DeleteCommand({ 
                    TableName: TABLE_NAME, 
                    Key: { productId: deleteId } 
                }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Deleted" }) };

            default:
                return { statusCode: 405, headers, body: JSON.stringify({ message: "Method Not Allowed" }) };
        }
    } catch (err) {
        console.error("Lambda Error:", err); // Logs to CloudWatch for debugging
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ 
                error: err.message,
                details: "Check Lambda CloudWatch logs for more info"
            }) 
        };
    }
};