// Svelto: discard stale/closed/private requests and contain network failures.
var searchbarPlugins = require('searchbar/searchbarPlugins.js')

var urlParser = require('util/urlParser.js')
var searchEngine = require('util/searchEngine.js')

function showSearchSuggestions (text, input, inputFlags) {
  const searchbar = require('searchbar/searchbar.js')
  const isCurrentQuery = () => searchbar.associatedInput === input &&
    searchbar.getValue() === text && !tabs.get(tabs.getSelected()).private
  if (!isCurrentQuery()) {
    return
  }
  const suggestionsURL = searchEngine.getCurrent().suggestionsURL

  if (!suggestionsURL) {
    searchbarPlugins.reset('searchSuggestions')
    return
  }

  if ((searchbarPlugins.getResultCount() - searchbarPlugins.getResultCount('searchSuggestions')) > 3) {
    searchbarPlugins.reset('searchSuggestions')
    return
  }

  fetch(suggestionsURL.replace('%s', encodeURIComponent(text)), {
    cache: 'force-cache'
  })
    .then(function (response) {
      return response.json()
    })
    .then(function (results) {
      if (!isCurrentQuery()) {
        return
      }
      searchbarPlugins.reset('searchSuggestions')

      if (searchbarPlugins.getResultCount() > 3) {
        return
      }

      if (Array.isArray(results) && Array.isArray(results[1])) {
        results = results[1].slice(0, 3)
        results.filter(result => typeof result === 'string').forEach(function (result) {
          var data = {
            title: result,
            url: result
          }

          if (urlParser.isPossibleURL(result)) { // website suggestions
            data.icon = 'carbon:earth-filled'
          } else { // regular search results
            data.icon = 'carbon:search'
          }

          searchbarPlugins.addResult('searchSuggestions', data)
        })
      }
    })
    .catch(function () {
      if (isCurrentQuery()) {
        searchbarPlugins.reset('searchSuggestions')
      }
    })
}

function initialize () {
  searchbarPlugins.register('searchSuggestions', {
    index: 4,
    trigger: function (text) {
      return !!text && text.indexOf('!') !== 0 && !tabs.get(tabs.getSelected()).private
    },
    showResults: debounce(showSearchSuggestions, 50)
  })
}

module.exports = { initialize }
