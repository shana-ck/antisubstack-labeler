import { LabelerServer } from "@skyware/labeler";
import { CommitCreateEvent, CommitType, Jetstream } from "@skyware/jetstream";
import "dotenv/config";
import subCheck from "./substack";
import headerCheck from "./headercheck";
import fs from "node:fs";
import logger from "./logger";
import { startMetricsServer, behind, restarts } from "./metrics";
import NodeCache from "node-cache"

const server = new LabelerServer({
  did: process.env.LABELER_DID,
  signingKey: process.env.SIGNING_KEY,
});

const port = 14831;

let cursor = 0;
let received = 0;
let processed = 0;

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120, maxKeys: 1000000})

const shortened = ['bit.ly', 'ow.ly', 'tinyurl.com', 'tiny.cc', 'trib.al', 'dlvr.it', 'buff.ly', 'is.gd', 'snipurl.com', 'notlong.com', 'clck.ru', 'tiny.pl', 'vurl.com', 't.co']


const domainFromURL=(url)=> {
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
return url
}
  } catch(err) {
    if (err instanceof TypeError) { 
 logger.error(err.message)
}
  return url
}
}


const checkCache = (uri) => {
  try {
   let key = domainFromURL(uri) || uri
  const cachedData = cache.get(key)
  if (cachedData) {
    console.log("cache hit", key, cachedData)
    return key
  }
  return false
  } catch(err) {
    console.log(err)
    return false
  }
}

setInterval(() => {
  logger.info(
    `Processed ${processed} of ${received}, ${received - processed} behind`,
  );
behind.set(received - processed);
}, 30_000);


// const db = new Database("labels.db");
// const row = db
//  .prepare("SELECT * from labels WHERE id=(SELECT max(id) FROM labels)")
//  .get(1);
// function epoch(date) {
//  return Date.parse(date);
// }
// const ts = epoch(row.cts);
// cursor = ts * 1000;

function epochUsToDateTime(cursor: number): string {
  return new Date(cursor).toISOString();
}

// const dbCursor = () => {
//  const row = db
//  .prepare("SELECT * from labels WHERE id=(SELECT max(id) FROM labels)")
//  .get(1);

// function epoch(date) {
//  return Date.parse(date);
// }

// const ts = epoch(row.cts);
// cursor = ts*1000;
// return cursor
// }

const checkLinks = async (url: string) => {
  let key = domainFromURL(url) || url
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

server.app.listen({ port: port, host: "127.0.0.1" }, (error) => {
  if (error) {
    console.error("Failed to start: ", error);
  } else {
    console.log(`Listening on port ${port}`);
    restarts.inc()
  }
});

const jetstream = new Jetstream({
  endpoint: "wss://jetstream1.us-east.bsky.network/subscribe",
  wantedCollections: ["app.bsky.feed.post"],
  cursor: cursor,
});

jetstream.on("open", () => {
  try {
    logger.info("Trying to read cursor from cursor.txt...");
    cursor = Number(fs.readFileSync("cursor.txt", "utf8"));
    logger.info(`Cursor found: ${cursor} (${epochUsToDateTime(cursor)})`);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      cursor = Date.now() - 300;
      logger.info(`Cursor not found, setting to ${cursor}`);
      fs.writeFileSync("cursor.txt", cursor.toString(), "utf8");
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
                await server.createLabel({ uri, val: "substack" });
                return
              }
            } else if (await checkLinks(feature.uri)) {
                await server.createLabel({ uri, val: "substack" });
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
          await server.createLabel({ uri, val: "substack" });
          return
        }
      } else if (await checkLinks(link)) {
	logger.info("embed")
        await server.createLabel({ uri, val: "substack" });
        return
      }
        return;
    }
  } finally {
    processed++;
  }
});

jetstream.on("close", () => {
  cursor = Date.now() - 300
  console.log(
    `Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("cursor.txt", cursor.toString(), "utf8");
});

jetstream.on("error", (err) => {
  logger.error(`Jetstream error: ${err.message}`);
//  cursor = dbCursor();
    cursor = Date.now() - 300
  console.log(
    `Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("cursor.txt", cursor.toString(), "utf8");
jetstream.close();
jetstream.start();
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
