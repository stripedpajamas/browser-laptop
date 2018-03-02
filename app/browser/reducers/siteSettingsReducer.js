/* This SourceCode Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'
const Immutable = require('immutable')
const appConstants = require('../../../js/constants/appConstants')
const siteSettings = require('../../../js/state/siteSettings')
const urlUtil = require('../../../js/lib/urlutil')
const {makeImmutable} = require('../../common/state/immutableUtil')
const urlParse = require('../../common/urlParse')
const {setUserPref} = require('../../../js/state/userPrefs')

const siteSettingsReducer = (state, action, immutableAction) => {
  action = immutableAction || makeImmutable(action)
  switch (action.get('actionType')) {
    case appConstants.APP_ALLOW_FLASH_ONCE:
      {
        const propertyName = action.get('isPrivate') ? 'temporarySiteSettings' : 'siteSettings'
        state = state.set(propertyName,
          siteSettings.mergeSiteSetting(state.get(propertyName), urlUtil.getOrigin(action.get('url')), 'flash', 1))
        break
      }
    case appConstants.APP_ALLOW_FLASH_ALWAYS:
      {
        const propertyName = action.get('isPrivate') ? 'temporarySiteSettings' : 'siteSettings'
        const expirationTime = Date.now() + (7 * 24 * 3600 * 1000)
        state = state.set(propertyName,
          siteSettings.mergeSiteSetting(state.get(propertyName), urlUtil.getOrigin(action.get('url')), 'flash', expirationTime))
        break
      }
    case appConstants.APP_CHANGE_SITE_SETTING:
      {
        let propertyName = action.get('temporary') ? 'temporarySiteSettings' : 'siteSettings'
        let newSiteSettings = siteSettings.mergeSiteSetting(state.get(propertyName), action.get('hostPattern'), action.get('key'), action.get('value'))
        if (action.get('skipSync')) {
          newSiteSettings = newSiteSettings.setIn([action.get('hostPattern'), 'skipSync'], true)
        }
        state = state.set(propertyName, newSiteSettings)
        break
      }
    case appConstants.APP_REMOVE_SITE_SETTING:
      {
        let propertyName = action.get('temporary') ? 'temporarySiteSettings' : 'siteSettings'
        let newSiteSettings = siteSettings.removeSiteSetting(state.get(propertyName),
          action.get('hostPattern'), action.get('key'))
        if (action.get('skipSync')) {
          newSiteSettings = newSiteSettings.setIn([action.get('hostPattern'), 'skipSync'], true)
        }
        state = state.set(propertyName, newSiteSettings)
        break
      }
    case appConstants.APP_CLEAR_SITE_SETTINGS:
      {
        let propertyName = action.get('temporary') ? 'temporarySiteSettings' : 'siteSettings'
        let newSiteSettings = new Immutable.Map()
        state.get(propertyName).map((entry, hostPattern) => {
          let newEntry = entry.delete(action.get('key'))
          if (action.get('skipSync')) {
            newEntry = newEntry.set('skipSync', true)
          }
          newSiteSettings = newSiteSettings.set(hostPattern, newEntry)
        })
        state = state.set(propertyName, newSiteSettings)
        break
      }
    case appConstants.APP_ADD_NOSCRIPT_EXCEPTIONS:
      {
        const origin = action.get('origins')
        const hostPattern = action.get('hostPattern')
        const propertyName = action.get('temporary') ? 'temporarySiteSettings' : 'siteSettings'
        // Note that this is always cleared on restart or reload, so should not
        // be synced or persisted.
        const key = 'noScriptExceptions'
        if (!origin || !origin.size) {
          // Clear the exceptions
          state = state.setIn([propertyName, hostPattern, key], new Immutable.Map())
        } else {
          const currentExceptions = state.getIn([propertyName, hostPattern, key]) || new Immutable.Map()
          state = state.setIn([propertyName, hostPattern, key], currentExceptions.merge(origin))
        }
        break
      }
    case appConstants.APP_TAB_UPDATED:
      {
        let url = action.get('tabValue').get('url')
        let parsedUrl = urlParse(url)
        let currentSiteSetting = state.get('siteSettings')
        let siteSafeBrowsing = true
        let safeBrowsingAll = state.get('safeBrowsingAll')

        if (safeBrowsingAll === undefined) {
          break
        }

        if (currentSiteSetting !== undefined &&
          (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:')) {
          let ruleKey = `https?://${parsedUrl.host}`
          let currentSettings = currentSiteSetting.get(ruleKey)
          if (currentSettings !== undefined) {
            siteSafeBrowsing = currentSettings.get('safeBrowsing')
          }
        }
        siteSafeBrowsing = siteSafeBrowsing === undefined ? true : siteSafeBrowsing

        setUserPref('safebrowsing.enabled',
                     safeBrowsingAll.get('enabled') &&
                     siteSafeBrowsing)
      }
  }
  return state
}

module.exports = siteSettingsReducer
