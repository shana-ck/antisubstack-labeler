import fetch from 'node-fetch';

async function expandUrl(shortUrl) {
  try {
    // By default, fetch follows redirects ('follow').
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow'
    });
    
    // The final URL is available in response.url after all redirects are followed
    console.log("Original URL:", response.url);
    return response.url;

  } catch (error) {
    console.error("Error expanding URL:", error);
    return shortUrl
  }
}

export default expandUrl
