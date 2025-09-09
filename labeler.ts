import { LabelerServer } from '@skyware/labeler';
import { CommitCreateEvent, CommitType, Jetstream } from '@skyware/jetstream';
import 'dotenv/config';
import subCheck from './substack';
import headerCheck from './headercheck';
import fs from 'node:fs'
import Database from 'libsql'
import logger from './logger';
import { startMetricsServer } from './metrics';

const server = new LabelerServer({
  did: process.env.LABELER_DID,
  signingKey: process.env.SIGNING_KEY
});

const port = 14831;

let cursor = 0;

const db = new Database('labels.db');
const row = db.prepare("SELECT * from labels WHERE id=(SELECT max(id) FROM labels)").get(1)
function epoch(date) {
  return Date.parse(date)
}
const ts = epoch(row.cts)
cursor = ts
function epochUsToDateTime(cursor: number): string {
  return new Date(cursor/1000).toISOString()
};

server.app.listen({ port: port, host: '127.0.0.1' }, error => {
  if (error) {
    console.error('Failed to start: ', error);
  } else {
    console.log(`Listening on port ${port}`);
  }
});

const jetstream = new Jetstream({
  endpoint: 'wss://jetstream1.us-east.bsky.network/subscribe',
  wantedCollections: ['app.bsky.feed.post'],
  cursor: cursor,
});

jetstream.on("open", ()=> {
  try {
    logger.info('Trying to read cursor from cursor.txt...')
    cursor = Number(fs.readFileSync('cursor.txt', 'utf8'))
    logger.info(`Cursor found: ${cursor} (${epochUsToDateTime(cursor)})`)
  } catch(err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      cursor = ts
      logger.info(`Cursor not found, setting to ${cursor}`)
      fs.writeFileSync('cursor.txt', cursor.toString(), 'utf8')
    } else {
      logger.error(err)
      process.exit(1)
    }
  }
  logger.info(`Connected to Jetstream with cursor ${cursor} (${epochUsToDateTime(cursor)})`)
})

const metricsServer = startMetricsServer(14833)

jetstream.start();


jetstream.onCreate('app.bsky.feed.post', async evt => {
  const record = evt.commit.record;
  const uri = `at://${evt.did}/${evt.commit.collection}/${evt.commit.rkey}`;
  if (record.facets) {
    let facets = record.facets;
    for (let facet of facets) {
      for (let feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link') {
          if (await subCheck(feature.uri)) {
            logger.info('found a substack!');
            await server.createLabel({ uri, val: 'substack' });
return;
          } else if (await headerCheck(feature.uri)) {
            logger.info('header check!');
            await server.createLabel({ uri, val: 'substack' });
	    return;          
}
        }
      }
    }
facets = [];
  } 
 if (record.embed?.$type === 'app.bsky.embed.external') {
	let link = record.embed.external.uri;
	if (await subCheck(link)) {
	logger.info('embed');
        await server.createLabel({ uri, val: 'substack' });
	return;
	} else if (await headerCheck(link)) {
        logger.info('embed');
	await server.createLabel({ uri, val: 'substack' });
	return;
}
}
});

jetstream.on('close', () => {
  cursor = Math.floor((Date.now() - (300*1000)) * 1000);
  console.log(`Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`);
    fs.writeFileSync('cursor.txt', cursor.toString(), 'utf8')
})

jetstream.on('error', (err) => {
  console.log(`Jetstream error: ${err.message}`)
  cursor = ts;
  console.log(`Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`);
  fs.writeFileSync('cursor.txt', cursor.toString(), 'utf8')
});

process.on('SIGINT', function() {
  try {
   jetstream.close()
   metricsServer.close()
  } catch(err) {
    logger.error(`Error shutting down gracefully: ${err}`)
    process.exit(1)
  }
})

process.on('SIGTERM', function() {
  try {
   jetstream.close()
   metricsServer.close()
  } catch(err) {
    logger.error(`Error shutting down gracefully: ${err}`)
    process.exit(1)
  }
})
