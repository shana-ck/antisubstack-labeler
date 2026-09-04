import { Agent, fetch } from "undici";

async function expandUrl(shortUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const pool = new Agent({ connect: { keepAlive: false}})
  try {
    // By default, fetch follows redirects ('follow').
    const response = await fetch(shortUrl, {
      dispatcher: pool,
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    });
    

    return response.url;

  } catch (error) {

    return shortUrl
  }
  finally {
   clearTimeout(timeout);
  }
}

export default expandUrl
