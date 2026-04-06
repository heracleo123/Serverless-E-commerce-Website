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

if (!tableName || !filePath) {
  console.error('Usage: node scripts/seed-reviews.js --table <tableName> --file <jsonPath> [--region <aws-region>]');
  process.exit(1);
}

const resolvedFilePath = path.resolve(filePath);
const client = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(client);

async function loadReviews() {
  const raw = await fs.readFile(resolvedFilePath, 'utf8');
  const data = JSON.parse(raw);
  const reviews = Array.isArray(data) ? data : data.reviews;

  if (!Array.isArray(reviews)) {
    throw new Error('Review JSON must be an array or contain a top-level "reviews" array');
  }

  const batches = [];
  for (let i = 0; i < reviews.length; i += 25) {
    batches.push(reviews.slice(i, i + 25));
  }

  for (const [index, batch] of batches.entries()) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: batch.map((review) => ({ PutRequest: { Item: review } }))
      }
    });

    const result = await ddb.send(command);

    if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
      await ddb.send(new BatchWriteCommand({ RequestItems: result.UnprocessedItems }));
    }

    console.log(`Review batch ${index + 1}/${batches.length} written`);
  }

  console.log('Reviews loaded successfully.');
}

loadReviews().catch((error) => {
  console.error('Failed to seed reviews:', error);
  process.exit(1);
});