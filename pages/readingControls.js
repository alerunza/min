// Svelto: keyboard-accessible appearance popovers for Reader and PDF.
document.body.classList.toggle('mac', navigator.platform.startsWith('Mac'))
function initializeReadingControls () {
  const button = document.getElementById('settings-button')
  const dropdown = document.getElementById('settings-dropdown')
  button.setAttribute('aria-controls', dropdown.id)
  function setOpen (open) {
    dropdown.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    button.classList.toggle('force-visible', open)
  }
  setOpen(false)
  button.addEventListener('click', function () {
    setOpen(dropdown.hidden)
    if (!dropdown.hidden) dropdown.querySelector('button').focus()
  })
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !dropdown.hidden) {
      event.preventDefault()
      setOpen(false)
      button.focus()
    }
  })
  document.addEventListener('click', function (event) {
    if (!dropdown.contains(event.target) && !button.contains(event.target)) setOpen(false)
  })
  window.addEventListener('blur', function () {
    if (document.activeElement.tagName === 'IFRAME') setOpen(false)
  })
}
initializeReadingControls()
