const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});

exports.handler = async (event) => {
    try {
        /* --- 1. THE DATABASE SCAN --- */
        // ScanCommand reads every single item
        const command = new ScanCommand({ TableName: "Products" });
        const { Items } = await client.send(command);
        
        /* --- 2. DATA UNMARSHALLING --- */
        // DynamoDB stores data in a unique format (e.g., { "price": { "N": "1200" } }).
        // 'unmarshall' converts that into standard JSON (e.g., { "price": 1200 }).
        // We map through the array to clean up every item returned.
        const unmarshalledItems = (Items || []).map(item => unmarshall(item));

        /* --- 3. THE RESPONSE (WITH CORS) --- */
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            },
            // The body must be a string, so we stringify our clean JSON array.
            body: JSON.stringify(unmarshalledItems), 
        };
    } catch (err) {
        /* --- 4. ERROR HANDLING --- */
        console.error("Database Fetch Error:", err); // Logs the error to CloudWatch
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            },
            body: JSON.stringify({ error: err.message }),
        };
    }
};