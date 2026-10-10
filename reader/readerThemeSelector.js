// Svelto: expose the selected appearance to assistive technology.
var metaThemeElement = document.getElementById('meta-theme')

var themeSelectors = document.querySelectorAll('.theme-circle')

var metaThemeValues = {
  light: '#fffefa',
  dark: '#252726',
  sepia: '#f5ecd9'
}

function isNight () {
  var hours = new Date().getHours()
  return hours > 21 || hours < 6
}

function setTheme (theme) {
  document.body.setAttribute('theme', theme)
  if (window.rframe && window.rframe.contentDocument) {
    rframe.contentDocument.body.setAttribute('theme', theme)
  }

  metaThemeElement.content = metaThemeValues[theme]

  themeSelectors.forEach(function (el) {
    el.setAttribute('aria-pressed', String(el.getAttribute('data-theme') === theme))
    if (el.getAttribute('data-theme') === theme) {
      el.classList.add('selected')
    } else {
      el.classList.remove('selected')
    }
  })
}

function setReaderTheme () {
  settings.get('darkMode', function (globalDarkModeEnabled) {
    settings.get('readerDayTheme', function (readerDayTheme) {
      settings.get('readerNightTheme', function (readerNightTheme) {
        if (isNight() && readerNightTheme) {
          setTheme(readerNightTheme)
        } else if (!isNight() && readerDayTheme) {
          setTheme(readerDayTheme)
        } else if (globalDarkModeEnabled === 1 || globalDarkModeEnabled === true || isNight()) {
          setTheme('dark')
        } else {
          setTheme('light')
        }
      })
    })
  })
}

setReaderTheme()

// set theme when buttons selected

themeSelectors.forEach(function (el) {
  el.addEventListener('click', function () {
    var theme = this.getAttribute('data-theme')
    if (isNight()) {
      settings.set('readerNightTheme', theme)
    } else {
      settings.set('readerDayTheme', theme)
    }
    setReaderTheme()
  })
})
