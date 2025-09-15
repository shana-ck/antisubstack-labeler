import { LabelerServer } from "@skyware/labeler";
import { CommitCreateEvent, CommitType, Jetstream } from "@skyware/jetstream";
import "dotenv/config";
import subCheck from "./substack";
import headerCheck from "./headercheck";
import fs from "node:fs";
import Database from "libsql";
import logger from "./logger";
import { startMetricsServer } from "./metrics";
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

const domainFromURL=(url)=> {
    const urlObj = new URL(url)
    const domain = urlObj.hostname
    const key = domain
    return key
}

const checkCache = (uri) => {
  try {
   let key = domainFromURL(uri)
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
}, 30_000);


const db = new Database("labels.db");
const row = db
  .prepare("SELECT * from labels WHERE id=(SELECT max(id) FROM labels)")
  .get(1);
function epoch(date) {
  return Date.parse(date);
}
const ts = epoch(row.cts);
cursor = ts * 1000;
function epochUsToDateTime(cursor: number): string {
  return new Date(cursor / 1000).toISOString();
}

const dbCursor = () => {
  const row = db
  .prepare("SELECT * from labels WHERE id=(SELECT max(id) FROM labels)")
  .get(1);
function epoch(date) {
  return Date.parse(date);
}
const ts = epoch(row.cts);
cursor = ts;
return cursor
}

server.app.listen({ port: port, host: "127.0.0.1" }, (error) => {
  if (error) {
    console.error("Failed to start: ", error);
  } else {
    console.log(`Listening on port ${port}`);
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
      cursor = ts;
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
            } else {
            if (await subCheck(feature.uri)) {
              let key = domainFromURL(feature.uri)
              cache.set(key, true)
              await server.createLabel({ uri, val: "substack" });
              return;
            } else if (await headerCheck(feature.uri)) {

              let key = domainFromURL(feature.uri)
              
              cache.set(key, true)
              await server.createLabel({ uri, val: "substack" });
              return;
            } else {
              let key = domainFromURL(feature.uri)
              cache.set(key, false)
            }
          }
        }
        }
      }
    }
    if (record.embed?.$type === "app.bsky.embed.external") {
      let link = record.embed.external.uri;
      if (await subCheck(link)) {
        logger.info("embed");
        let key = domainFromURL(link)
        cache.set(key, true)
        await server.createLabel({ uri, val: "substack" });
        return;
      } else if (await headerCheck(link)) {
        logger.info("embed");
        let key = domainFromURL(link)
        cache.set(key, true)
        await server.createLabel({ uri, val: "substack" });
        return;
      } else {
              let key = domainFromURL(link)
              cache.set(key, false)

      }
    }
  } finally {
    processed++;
  }
});

jetstream.on("close", () => {
  cursor = Math.floor((Date.now() - 300 * 1000) * 1000);
  console.log(
    `Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("cursor.txt", cursor.toString(), "utf8");
});

jetstream.on("error", (err) => {
  logger.error(`Jetstream error: ${err.message}`);
  cursor = dbCursor();
  console.log(
    `Cursor updating, setting to ${cursor} (${epochUsToDateTime(cursor)})`,
  );
  fs.writeFileSync("cursor.txt", cursor.toString(), "utf8");
jetstream.close()
jetstream.start()
});

process.on("SIGINT", function () {
  try {
    jetstream.close();
    metricsServer.close();
  } catch (err) {
    logger.error(`Error shutting down gracefully: ${err}`);
    process.exit(1);
  }
});

process.on("SIGTERM", function () {
  try {
    jetstream.close();
    metricsServer.close();
  } catch (err) {
    logger.error(`Error shutting down gracefully: ${err}`);
    process.exit(1);
  }
});
