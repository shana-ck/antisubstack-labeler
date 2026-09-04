import { LabelerServer } from "@skyware/labeler";
import { Jetstream } from "@skyware/jetstream";
import "dotenv/config";
import subCheck from "./substack.ts";
import headerCheck from "./headercheck.ts";
import expandUrl from "./expandurl.ts";
import fs from "node:fs";
import logger from "./logger.ts";
import NodeCache from "node-cache";
import { startMetricsServer, behind, restarts, inflightReq, drainReq } from "./metrics.ts";
import { WebSocket } from "partysocket"

const options = {
connectionTimeout: 10000
}

const wsEndpoints = ['wss://jetstream2.us-west.bsky.network/subscribe',' wss://jetstream2.us-east.bsky.network/subscribe', 'wss://jetstream1.us-west.bsky.network/subscribe',
 'wss://jetstream1.us-east.bsky.network/subscribe']

let jsEndpoint = wsEndpoints[Math.floor(Math.random() * wsEndpoints.length)]
const ws = new WebSocket(jsEndpoint, [], options)

const server = new LabelerServer({
  did: process.env.LABELER_DID,
  signingKey: process.env.SIGNING_KEY,
  dbPath: "./data/labels.db"
});

const port = 14831;

let cursor = 0;
let received = 0;
let processed = 0;

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 1000000})

function createBackpressuredWriter(server: LabelerServer, maxConcurrent = 50) {
  let inflight = 0;
  let waiters = [];
 
  async function drain() {
    if (inflight < maxConcurrent)
      return;
    logger.info('DRAIN!!!!')
    drainReq.inc()
    await new Promise(resolve => waiters.push(resolve));
  }
  function release() {
    inflight--;
    if (waiters.length > 0) {
      waiters.shift()();
    }
  }
 
  return {
    get inflight() {
	inflightReq.set(inflight)
      return inflight; 
    },
    async createLabel(opts) {
      await drain();          // blocks here if too many in-flight
      inflight++;
      try {
        return await server.createLabel(opts);
      } finally {
        release();
      }
    }
  };
}

const writer = createBackpressuredWriter(server, 20)

let short=false;
const shortened = ['bit.ly', 'ow.ly', 'tinyurl.com', 'tiny.cc', 'trib.al', 'dlvr.it', 'is.gd', 'snipurl.com', 'notlong.com', 'clck.ru', 'tiny.pl', 'vurl.com', 't.co']

const domainFromURL=(url)=> {
short = false;
  let validate = /^((http|https|ftp):\/\/)/;
  if (!validate.test(url)) {
    url = "http://" + url
  }
  try {
    const urlObj = new URL(url)
    const domain = urlObj.hostname
    const key = domain
  if (!shortened.includes(key)) {
    return key
} else {
  short = true
  return url
}
  } catch(err) {
    if (err instanceof TypeError) { 
 logger.error(err.message)
}
  return url
}
}

logger.info(jsEndpoint)
const checkCache = (uri) => {
  try {
   let key = domainFromURL(uri) || uri
  const cachedData = cache.get(key)
  if (cachedData) {
    logger.info("cache hit", key, cachedData)
    return key
  }
  return false
  } catch(err) {
    logger.info(err)
    return false
  }
}

setInterval(() => {
  logger.info(
    `Processed ${processed} of ${received}, ${received - processed} behind`,
  );
behind.set(received - processed);
}, 30_000);

function epochUsToDateTime(cursor: number): string {
  return new Date(cursor).toISOString();
}


const checkLinks = async (url: string) => {
  let key = domainFromURL(url) || url
  if (short) {
    url = await expandUrl(key)
//    console.log("short! ", key)
    }

 if (await subCheck(url) === 1) {
    cache.set(key, true)
    return true
  } else if (await subCheck(url) === 2) {
    let headers = await headerCheck(url)
    if (headers) {
      logger.info("header check")
      cache.set(key, true)
      return true
    }
  } else {
    cache.set(key, false)
    return false
  }
}

server.app.listen({ port: port, host: "0.0.0.0" }, (error) => {
  if (error) {
    logger.error("Failed to start: ", error);
  } else {
    logger.info(`Listening on port ${port}`);
    restarts.inc()
  }
});

const jetstream = new Jetstream({
  endpoint: jsEndpoint,
  wantedCollections: ["app.bsky.feed.post"],
  cursor: cursor,
});

jetstream.on("open", () => {
  try {
    logger.info("Trying to read cursor from cursor.txt...");
    cursor = Number(fs.readFileSync("./data/cursor.txt", "utf8"));
    logger.info(`Cursor found: ${cursor} (${epochUsToDateTime(cursor)})`);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      cursor = Date.now() - 300000;
      logger.info(`Cursor not found, setting to ${cursor}`);
      fs.writeFileSync("./data/cursor.txt", cursor.toString(), "utf8");
    } else {
      logger.error(err);
      process.exit(1);
    }
  }
  logger.info(
    `Connected to Jetstream with cursor ${cursor} (${epochUsToDateTime(cursor)})`,
  );

});

const metricsServer = startMetricsServer(14833);

jetstream.start();

jetstream.onCreate("app.bsky.feed.post", async (evt) => {
  received++;
  try {
    const record = evt.commit.record;
    const uri = `at://${evt.did}/${evt.commit.collection}/${evt.commit.rkey}`;
    if (record.facets) {
      let facets = record.facets;
      for (let facet of facets) {
        for (let feature of facet.features) {
          if (feature.$type === "app.bsky.richtext.facet#link") {
            let key = checkCache(feature.uri)
            if (key) {
              let res = cache.get(key)
              if (res===true) {
                await writer.createLabel({ uri, val: "substack" });
                return
              }
            } else if (await checkLinks(feature.uri)) {
                await writer.createLabel({ uri, val: "substack" });
            }
          }
        }
}
}
    if (record.embed?.$type === "app.bsky.embed.external") {
      let link = record.embed.external.uri;
      let key = checkCache(link)
      if (key) {
        let res = cache.get(key)
        if (res===true) {
	  logger.info("embed")
          await writer.createLabel({ uri, val: "substack" });
          return
        }
      } else if (await checkLinks(link)) {
	logger.info("embed")
        await writer.createLabel({ uri, val: "substack" });
        return
      }
        return;
    }
  } finally {
    processed++;
  }
});

jetstream.on("close", () => {
  cursor = Date.now() - 300000
  logger.info(
    `Jetstream closed. Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("./data/cursor.txt", cursor.toString(), "utf8");
});

jetstream.on("error", (err) => {
  logger.error(`Jetstream error: ${err}`);
logger.error(err.message)
// console.log(err)
//  cursor = dbCursor();
    cursor = Date.now() - 300000
  logger.info(
    `Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("./data/cursor.txt", cursor.toString(), "utf8");
if (err.message == "TIMEOUT") {
let endpoint = wsEndpoints[Math.floor(Math.random() * wsEndpoints.length)]
    logger.info(endpoint)
    jetstream.url.href = endpoint
}
jetstream.close();
setTimeout(() => { jetstream.start()}, 5000);
restarts.inc()
});

process.on("SIGINT", function () {
  try {
    jetstream.close();
    server.close();
    metricsServer.close();
  } catch (err) {
    logger.error(`Error shutting down gracefully: ${err}`);
    process.exit(1);
  }
});

process.on("SIGTERM", function () {
  try {
    jetstream.close();
    server.close();
    metricsServer.close();
  } catch (err) {
    logger.error(`Error shutting down gracefully: ${err}`);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (err) => {
    logger.error('There was an uncaught error', err);
    process.exit(1); // mandatory retry or exit code
});
