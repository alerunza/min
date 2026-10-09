// Svelto: expose the selected appearance to assistive technology.
var settingsButton = document.getElementById('settings-button')
var settingsDropdown = document.getElementById('settings-dropdown')
var invertSection = document.getElementById('invert-pdf-section')
var invertCheckbox = document.getElementById('invert-pdf-checkbox')

// Most of this is similar to readerThemeSelector

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

themeSelectors.forEach(function (el) {
  el.addEventListener('click', function () {
    var theme = this.getAttribute('data-theme')
    if (isNight()) {
      settings.set('pdfNightTheme', theme)
    } else {
      settings.set('pdfDayTheme', theme)
    }
    setViewerTheme(theme)
  })
})

function setViewerTheme (theme) {
  themeSelectors.forEach(function (el) {
    el.setAttribute('aria-pressed', String(el.getAttribute('data-theme') === theme))
    if (el.getAttribute('data-theme') === theme) {
      el.classList.add('selected')
    } else {
      el.classList.remove('selected')
    }
  })

  metaThemeElement.content = metaThemeValues[theme]

  document.body.setAttribute('theme', theme)

  invertSection.hidden = !(theme === 'dark')

  setTimeout(function() {
    document.body.classList.add('theme-loaded')
  }, 16)
}

function initializeViewerTheme() {
  settings.get('darkMode', function (globalDarkModeEnabled) {
    settings.get('pdfDayTheme', function (pdfDayTheme) {
      settings.get('pdfNightTheme', function (pdfNightTheme) {
        if (isNight() && pdfNightTheme) {
          setViewerTheme(pdfNightTheme)
        } else if (!isNight() && pdfDayTheme) {
          setViewerTheme(pdfDayTheme)
        } else if (globalDarkModeEnabled === 1 || globalDarkModeEnabled === true || isNight()) {
          setViewerTheme('dark')
        } else {
          setViewerTheme('light')
        }
      })
    })
  })
}

initializeViewerTheme()

settings.get('PDFInvertColors', function (value) {
  invertCheckbox.checked = (value === true)
  document.body.setAttribute('data-invert', value || false)
})

invertCheckbox.addEventListener('click', function (e) {
  settings.set('PDFInvertColors', this.checked)
  document.body.setAttribute('data-invert', this.checked)
})
