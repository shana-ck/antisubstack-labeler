const subCheck = async (url: string) => {
  const httpRegex = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.substack\.com(?:\/.*)?$/;
  // links to these custom domains tend to slip past the labeler's headercheck for some unknown reason, so they are currently hardcoded in
  const httpRegex2 = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.thebulwark\.com(?:\/.*)?$/;
  const httpRegex3 = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.popular\.info(?:\/.*)?$/
  const httpRegex4 = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.retroist\.com(?:\/.*)?$/
  const httpRegex5 = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.jphilll\.com(?:\/.*)?$/
  const regexArr = [httpRegex, httpRegex2, httpRegex3, httpRegex4, httpRegex5];
  let found = false;
  regexArr.forEach(httpExp => {
    if (httpExp.test(url)) {
      found = true;
      return found;
    }
  });
  return found;
};

export default subCheck;
