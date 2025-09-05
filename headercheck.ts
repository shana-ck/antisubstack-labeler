const headerCheck = async (url: string) => {
const controller = new AbortController();
const signal = controller.signal
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal
    });
    const headers = Object.fromEntries(resp.headers.entries());
    if (headers['x-served-by'] === 'Substack') {
      return true;
    } else if (headers['x-sub'] === 'substack') {
      return true;
    } else if (headers['content-security-policy'].includes('substack')) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
controller.abort()    
return false;
  }
};

export default headerCheck;

