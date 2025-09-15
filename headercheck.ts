const headerCheck = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    const headers = Object.fromEntries(resp.headers.entries());
    if (headers["x-served-by"] === "Substack") {
      return true;
    } else if (headers["x-sub"] === "substack") {
      return true;
    } else if (headers["content-security-policy"]?.includes("substack")) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export default headerCheck;
