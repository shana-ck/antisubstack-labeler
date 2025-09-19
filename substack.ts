import UrlPattern from 'url-pattern';

const subCheck = async (url: string) => {
  // basic regex to check for substack domain on any link regardless of if it matches the path
  const regexHttp = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.substack\.com(?:\/.*)?$/;
  // as far as I am aware, these are the patterns for paths for pages hosted on substack
  // there may be more which I will certainly add if I find them
  const pathsPattern = [
    '(http(s)\\://)(:subdomain.):domain.:tld/p/(*)',
    '(http(s)\\://)(:subdomain.):domain.:tld/s/(*)',
    '(http(s)\\://)(:subdomain.):domain.:tld/podcast(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/archive(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/about(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/comments(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/welcome(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/sitemap.xml(/)',
    '(http(s)\\://)(:subdomain.):domain.:tld/@*',
    '(http(s)\\://)(:subdomain.):domain.:tld/pub*',
    '(http(s)\\://)(:subdomain.):domain.:tld/inbox*'
  ];
  // these domains occasionally sneak past the labeler so they are hardcoded in for now
  let sneaky = [
    'popular.info',
    'publicnotice.co',
    'thebulwark.com',
    'jphilll.com',
    'retroist.com'
  ];
  let pattern = new UrlPattern('(http(s)\\://)(:subdomain.):domain.:tld(/)');
  let domainCheck = pattern.match(url);
  // need three values to determine if link is definitely not a substack, is maybe a substack, or is definitely a substack
  // 0 = not a substack - the domain is not substack.com and the URL path pattern does not match substack URL paths
  // 1 = definitely a substack - domain is substack.com OR one of the hardcoded custom domains
  // 2 = maybe substack (need to check headers) - either a base URL (example.com) or one that matches the pattern (e.g. beehiiv-hosted newsletters also use /p/article-name)
  let found = 0;
  for (let path of pathsPattern) {
    let pathCheck = new UrlPattern(path);
    if (
      pathCheck.match(url) &&
      (pathCheck.match(url)['domain'] === 'substack' ||
        sneaky.includes(
          `${pathCheck.match(url)['domain']}.${pathCheck.match(url)['tld']}`
        ))
    ) {
      found = 1;
      return found;
    } else if (pathCheck.match(url)) {
      found = 2;
      return found;
    }
  }
  if (domainCheck && domainCheck['domain'] == 'substack') {
    console.log('substack domain');
    found = 1;
    return found;
  } else if (
    domainCheck &&
    sneaky.includes(`${domainCheck['domain']}.${domainCheck['tld']}`)
  ) {
    found = 1;
    return found;
  } else if (domainCheck) {
    // this literally just verifies that a valid link was found
    found = 2;
    return found
  } else if (regexHttp.test(url)) {
    found = 1
    return found
  }
  return found;
};

export default subCheck;
