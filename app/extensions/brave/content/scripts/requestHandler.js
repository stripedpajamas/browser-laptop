const ipc = chrome.ipcRenderer

ipc.send('got-background-page-webcontents')
const parser = new DOMParser()

ipc.on('fetch-publisher-info', (e, url, options) => {
  let finalUrl = url
  window.fetch(url, options).then((response) => {
    finalUrl = response.url
    return response.text()
  }).then((text) => {
    const html = parser.parseFromString(text, 'text/html')
    getMetaData(html, url, finalUrl)
  }).catch((err) => {
    console.log('fetch error', err)
    ipc.send('got-publisher-info-' + url, {
      error: err.message,
      body: {
        url: finalUrl
      }
    })
  })
})

const getMetaData = async (htmlDom, url, finalUrl) => {
  const result = {
    image: await getData({ htmlDom, finalUrl, conditions: getImageRules() }),
    title: await getData({ htmlDom, finalUrl, conditions: getTitleRules() }),
    author: await getData({ htmlDom, finalUrl, conditions: getAuthorRules() })
  }

  ipc.send('got-publisher-info-' + url, {
    error: null,
    body: {
      url: finalUrl,
      title: result.title || '',
      image: result.image || '',
      author: result.author || ''
    }
  })
}

// https://github.com/microlinkhq/metascraper
// Version 3.9.2

// Basic logic
const getData = async ({htmlDom,url,conditions}) => {
  const size = conditions.length
  let index = -1
  let value

  while (!value && index++ < size - 1) {
    value = await conditions[index]({htmlDom,url})
  }

  return value
}

// Rules
const getImageRules = () => {
  const wrap = rule => ({htmlDom,url}) => {
    const value = rule(htmlDom)
    return isUrl(value) && getUrl(url, value)
  }

  return [
    // Youtube
    ({htmlDom,url}) => {
      const {id,service} = getVideoId(url)
      return service === 'youtube' && id && getThumbnailUrl(id)
    },
    // Regular
    wrap(html => getContent(html.querySelector('meta[property="og:image:secure_url"]'))),
    wrap(html => getContent(html.querySelector('meta[property="og:image:url"]'))),
    wrap(html => getContent(html.querySelector('meta[property="og:image"]'))),
    wrap(html => getContent(html.querySelector('meta[name="twitter:image:src"]'))),
    wrap(html => getContent(html.querySelector('meta[name="twitter:image"]'))),
    wrap(html => getContent(html.querySelector('meta[name="sailthru.image.thumb"]'))),
    wrap(html => getContent(html.querySelector('meta[name="sailthru.image.full"]'))),
    wrap(html => getContent(html.querySelector('meta[name="sailthru.image"]'))),
    wrap(html => getValue(html, html.querySelector('article img[src]'), getSrc)),
    wrap(html => getValue(html, html.querySelector('#content img[src]'), getSrc)),
    wrap(html => getSrc(html.querySelector('img[alt*="author"]'))),
    wrap(html => getSrc(html.querySelector('img[src]')))
  ]
}

const getTitleRules = () => {
  const wrap = rule => ({htmlDom}) => {
    const value = rule(htmlDom)
    return isString(value) && titleize(value)
  }

  return [
    // Regular
    wrap(html => getContent(html.querySelector('meta[property="og:title"]'))),
    wrap(html => getContent(html.querySelector('meta[name="twitter:title"]'))),
    wrap(html => getContent(html.querySelector('meta[name="sailthru.title"]'))),
    wrap(html => getText(html.querySelector('.post-title'))),
    wrap(html => getText(html.querySelector('.entry-title'))),
    wrap(html => getText(html.querySelector('[itemtype="http://schema.org/BlogPosting"] [itemprop="name"]'))),
    wrap(html => getText(html.querySelector('h1[class*="title"] a'))),
    wrap(html => getText(html.querySelector('h1[class*="title"]'))),
    wrap(html => getText(html.querySelector('title')))
  ]
}

const getAuthorRules = () => {
  const wrap = rule => ({htmlDom}) => {
    const value = rule(htmlDom)

    return isString(value) &&
      !isUrl(value, {relative: false}) &&
      titleize(value, {removeBy: true})
  }

  return [
    // Youtube
    wrap(html => getText(html.querySelector('#owner-name'))),
    wrap(html => getText(html.querySelector('#channel-title'))),
    wrap(html => getValue(html, html.querySelector('[class*="user-info"]'))),
    // Regular
    wrap(html => getContent(html.querySelector('meta[property="author"]'))),
    wrap(html => getContent(html.querySelector('meta[property="article:author"]'))),
    wrap(html => getContent(html.querySelector('meta[name="author"]'))),
    wrap(html => getContent(html.querySelector('meta[name="sailthru.author"]'))),
    wrap(html => getValue(html, html.querySelector('[rel="author"]'))),
    wrap(html => getValue(html, html.querySelector('[itemprop*="author"] [itemprop="name"]'))),
    wrap(html => getValue(html, html.querySelector('[itemprop*="author"]'))),
    wrap(html => getContent(html.querySelector('meta[property="book:author"]'))),
    strict(wrap(html => getValue(html, html.querySelector('a[class*="author"]')))),
    strict(wrap(html => getValue(html, html.querySelector('[class*="author"] a')))),
    strict(wrap(html => getValue(html, html.querySelector('a[href*="/author/"]')))),
    wrap(html => getValue(html, html.querySelector('a[class*="screenname"]'))),
    strict(wrap(html => getValue(html, html.querySelector('[class*="author"]')))),
    strict(wrap(html => getValue(html, html.querySelector('[class*="byline"]'))))
  ]
}

// Helpers
const getText = (node) => ((node && (node.outerHTML || new XMLSerializer().serializeToString(node))) || '').replace(/([\s\n]*<[^>]*>[\s\n]*)+/g, ' ')

const urlCheck = (url) => {
  try {
    new URL(url)
    return true
  } catch (e) {
    return false
  }
}

const getContent = (selector) => {
  if (!selector) {
    return null
  }

  return selector.content
}

const getSrc = (selector) => {
  if (!selector) {
    return null
  }

  return selector.src
}

const urlTest = (url, {relative = true}) => {
  return relative
    ? !isAbsoluteUrl(url) || urlCheck(url)
    : urlCheck(url)
}

const isEmpty = (value) => value == null
const isUrl = (url, opts = {}) => !isEmpty(url) && urlTest(url, opts)
const getUrl = (baseUrl, relativePath = '') => {
  return !isAbsoluteUrl(relativePath)
    ? resolveUrl(baseUrl, relativePath)
    : relativePath
}

const REGEX_STRICT = /^\S+\s+\S+/
const strict = rule => $ => {
  const value = rule($)
  return REGEX_STRICT.test(value) && value
}

const titleize = (src, {removeBy = false} = {}) => {
  let title = createTitle(src)
  if (removeBy) title = removeByPrefix(title).trim()
  return title
}

const defaultFn = el => el.text().trim()

const getValue = (html, collection, fn = defaultFn) => {
  if (!collection || !fn) {
    return null
  }

  const el = collection.filter((i, el) => fn(el)).first()
  return fn(el)
}

const getThumbnailUrl = id => {
  return `https://img.youtube.com/vi/${id}/sddefault.jpg`
}

const getVideoId = (str) => {
  let metadata = {}

  if (/youtube|youtu\.be|i.ytimg\./.test(str)) {
    metadata = {
      id: getYoutubeId(str),
      service: 'youtube'
    }
  }

  return metadata
}

// https://github.com/radiovisual/get-video-id
const getYoutubeId = (str) => {
  // short code
  const shortCode = /youtube:\/\/|https?:\/\/youtu\.be\//g
  if (shortCode.test(str)) {
    const shortCodeId = str.split(shortCode)[1]
    return stripParameters(shortCodeId)
  }

  // /v/ or /vi/
  const inlineV = /\/v\/|\/vi\//g
  if (inlineV.test(str)) {
    const inlineId = str.split(inlineV)[1]
    return stripParameters(inlineId)
  }

  // v= or vi=
  const parameterV = /v=|vi=/g
  if (parameterV.test(str)) {
    const arr = str.split(parameterV)
    return arr[1].split('&')[0]
  }

  // v= or vi=
  const parameterWebP = /\/an_webp\//g
  if (parameterWebP.test(str)) {
    const webP = str.split(parameterP)[1]
    return stripParameters(webP)
  }

  // embed
  const embedReg = /\/embed\//g
  if (embedReg.test(str)) {
    const embedId = str.split(embedReg)[1]
    return stripParameters(embedId)
  }

  // user
  const userReg = /\/user\//g
  if (userReg.test(str)) {
    const elements = str.split('/')
    return stripParameters(elements.pop())
  }

  // attribution_link
  const attrReg = /\/attribution_link\?.*v%3D([^%&]*)(%26|&|$)/
  if (attrReg.test(str)) {
    return str.match(attrReg)[1]
  }
}

const stripParameters = (str) => {
  // Split parameters or split folder separator
  if (str.indexOf('?') > -1) {
    return str.split('?')[0]
  } else if (str.indexOf('/') > -1) {
    return str.split('/')[0]
  }

  return str
}

// https://github.com/kellym/smartquotesjs
const replacements = [
  // triple prime
  [/'''/g, retainLength => '\u2034' + (retainLength ? '\u2063\u2063' : '')],
  // beginning "
  [/(\W|^)"(\w)/g, '$1\u201c$2'],
  // ending "
  [/(\u201c[^"]*)"([^"]*$|[^\u201c"]*\u201c)/g, '$1\u201d$2'],
  // remaining " at end of word
  [/([^0-9])"/g, '$1\u201d'],
  // double prime as two single quotes
  [/''/g, retainLength => '\u2033' + (retainLength ? '\u2063' : '')],
  // beginning '
  [/(\W|^)'(\S)/g, '$1\u2018$2'],
  // conjunction's possession
  [/([a-z])'([a-z])/ig, '$1\u2019$2'],
  // abbrev. years like '93
  [/(\u2018)([0-9]{2}[^\u2019]*)(\u2018([^0-9]|$)|$|\u2019[a-z])/ig, '\u2019$2$3'],
  // ending '
  [/((\u2018[^']*)|[a-z])'([^0-9]|$)/ig, '$1\u2019$3'],
  // backwards apostrophe
  [/(\B|^)\u2018(?=([^\u2018\u2019]*\u2019\b)*([^\u2018\u2019]*\B\W[\u2018\u2019]\b|[^\u2018\u2019]*$))/ig, '$1\u2019'],
  // double prime
  [/"/g, '\u2033'],
  // prime
  [/'/g, '\u2032']
];

const smartQuotes = (str) => {
  replacements.forEach(replace => {
    const replacement = typeof replace[1] === 'function' ? replace[1]({}) : replace[1]
    str = str.replace(replace[0], replacement)
  })
  return str
}

const REGEX_BY = /^[\s\n]*by|@[\s\n]*/i
const removeByPrefix = (str = '') => {
  return str.replace(REGEX_BY, '').trim()
}

const createTitle = (str = '') => {
  str = str.trim().replace(/\s{2,}/g, ' ')
  return smartQuotes(str)
}

// https://github.com/sindresorhus/is-absolute-url
const isAbsoluteUrl = (url) => {
  if (!isString(url)) {
    return url
  }

  return /^[a-z][a-z0-9+.-]*:/.test(url)
}

const resolveUrl = (baseUrl, relativePath) => {
  let url = baseUrl
  try {
    url = new URL(relativePath, [baseUrl])
  } catch (e) {}

  return url
}

const isString = (str) => typeof str === 'string'
