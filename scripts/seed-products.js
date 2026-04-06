import fs from 'fs/promises';
import path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

function parseArg(name, defaultValue) {
  const index = process.argv.indexOf(name);
  if (index === -1) return defaultValue;
  return process.argv[index + 1];
}

const tableName = parseArg('--table');
const filePath = parseArg('--file');
const region = parseArg('--region') || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const cloudfrontUrl = parseArg('--cloudfront-url');

if (!tableName || !filePath) {
  console.error('Usage: node scripts/seed-products.js --table <tableName> --file <jsonPath> [--region <aws-region>] [--cloudfront-url <url>]');
  process.exit(1);
}

const resolvedFilePath = path.resolve(filePath);

const client = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(client);

async function loadProducts() {
  const raw = await fs.readFile(resolvedFilePath, 'utf8');
  const data = JSON.parse(raw);
  let products = Array.isArray(data) ? data : data.products;

  if (!products || !Array.isArray(products)) {
    throw new Error('Products JSON must be an array or contain a top-level "products" array');
  }

  // Replace image URLs with CloudFront URL if provided
  if (cloudfrontUrl) {
    const oldBaseUrl = 'https://electrotech-assets-2026-v1.s3.us-east-1.amazonaws.com/';
    const newBaseUrl = `${cloudfrontUrl}/images/`;
    
    products = products.map(product => {
      const updatedProduct = { ...product };
      
      if (updatedProduct.imageUrl && updatedProduct.imageUrl.startsWith(oldBaseUrl)) {
        updatedProduct.imageUrl = updatedProduct.imageUrl.replace(oldBaseUrl, newBaseUrl);
      }
      
      if (updatedProduct.images && Array.isArray(updatedProduct.images)) {
        updatedProduct.images = updatedProduct.images.map(img => 
          img.startsWith(oldBaseUrl) ? img.replace(oldBaseUrl, newBaseUrl) : img
        );
      }
      
      return updatedProduct;
    });
    
    console.log(`Updated image URLs to use CloudFront: ${newBaseUrl}`);
  }

  const batches = [];
  for (let i = 0; i < products.length; i += 25) {
    batches.push(products.slice(i, i + 25));
  }

  console.log(`Seeding ${products.length} items into DynamoDB table ${tableName} in ${region}`);

  for (const [index, batch] of batches.entries()) {
    const requestItems = batch.map(item => ({ PutRequest: { Item: item } }));
    const command = new BatchWriteCommand({ RequestItems: { [tableName]: requestItems } });
    const result = await ddb.send(command);

    if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
      console.warn('Warning: Some items were unprocessed. Retrying once...');
      await ddb.send(new BatchWriteCommand({ RequestItems: result.UnprocessedItems }));
    }

    console.log(`Batch ${index + 1}/${batches.length} written`);
  }

  console.log('Products loaded successfully.');
}

loadProducts().catch(error => {
  console.error('Failed to seed products:', error);
  process.exit(1);
});
