// Svelto: use PDF.js 4 page/text/link APIs with bounded canvases and explicit load errors.
import '../../node_modules/pdfjs-dist/build/pdf.min.mjs'
import '../../node_modules/pdfjs-dist/web/pdf_viewer.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.mjs'
const url = new URLSearchParams(window.location.search).get('url')
const pages = document.getElementById('pdf-pages')
const counter = document.querySelector('#page-counter input')
const total = document.getElementById('total')
const progress = document.getElementById('progress-bar')
const eventBus = new pdfjsViewer.EventBus()
const pageViews = []
const rendering = new Map()
const extraTextLayers = new Map()
let pdf = null
let currentPage = 0
let printing = false
const printScales = new Map()
let resizeTimer
let resizeWork = Promise.resolve()
let loaded = false
counter.setAttribute('aria-label', l('PDFPageNumber'))
counter.setAttribute('inputmode', 'numeric')
counter.disabled = true

const linkService = new pdfjsViewer.PDFLinkService({ eventBus, externalLinkTarget: 2 })
linkService.setViewer({
  get currentPageNumber () { return currentPage + 1 },
  set currentPageNumber (number) { goToPage(number) },
  get pagesCount () { return pageViews.length },
  getPageView: index => pageViews[index],
  scrollPageIntoView: ({ pageNumber }) => goToPage(pageNumber),
  isPageVisible: number => number === currentPage + 1,
  isPageCached: number => !!pageViews[number - 1]?.canvas,
  pageLabelToPageNumber: label => Number(label)
})

function goToPage (number) {
  if (!Number.isInteger(number) || !pageViews[number - 1]) {
    counter.value = currentPage + 1
    return
  }
  currentPage = number - 1
  pageViews[currentPage].div.scrollIntoView({ block: 'start' })
  counter.value = number
  updateVisiblePages()
}
counter.addEventListener('change', () => goToPage(Number(counter.value)))
counter.addEventListener('keydown', event => {
  if (event.key === 'Enter') { goToPage(Number(counter.value)); counter.blur() }
})
counter.addEventListener('focus', () => counter.select())
function downloadPDF () { window.postMessage({ message: 'downloadFile', url }) }
document.getElementById('download-button').addEventListener('click', downloadPDF)
document.getElementById('pdf-error-download').addEventListener('click', downloadPDF)
document.getElementById('pdf-retry').addEventListener('click', () => window.location.reload())

function scaleForPage (page) {
  const width = page.getViewport({ scale: 1 }).width * (4 / 3)
  return Math.min(1.15, Math.max(1, window.innerWidth - 32) / width)
}
function reportError (error) {
  console.warn('PDF preview failed', error)
  progress.hidden = true
  pages.setAttribute('aria-busy', 'false')
  document.getElementById('pdf-error').hidden = false
}
async function renderText (view) {
  if (rendering.has(view.id)) await rendering.get(view.id)
  if (view.textLayer?.renderingDone) return
  if (extraTextLayers.has(view.id)) return extraTextLayers.get(view.id).ready
  const layer = new pdfjsViewer.TextLayerBuilder({ onAppend: div => view.div.appendChild(div) })
  extraTextLayers.set(view.id, layer)
  layer.ready = (async () => {
    const content = await view.pdfPage.getTextContent()
    if (extraTextLayers.get(view.id) !== layer) return
    layer.setTextContentSource(content)
    await layer.render(view.viewport)
  })().catch(error => {
    if (extraTextLayers.get(view.id) !== layer) return
    extraTextLayers.delete(view.id)
    throw error
  })
  return layer.ready
}
async function drawPage (view) {
  if (rendering.has(view.id)) return rendering.get(view.id)
  if (view.canvas) return
  const task = (async () => {
    extraTextLayers.get(view.id)?.cancel()
    extraTextLayers.get(view.id)?.div.remove()
    extraTextLayers.delete(view.id)
    view.reset()
    const textDone = new Promise(resolve => {
      function onText (event) {
        if (event.pageNumber !== view.id) return
        eventBus.off('textlayerrendered', onText)
        resolve()
      }
      eventBus.on('textlayerrendered', onText)
    })
    await view.draw()
    await textDone
  })().catch(error => {
    if (error.name !== 'RenderingCancelledException') reportError(error)
  }).finally(() => rendering.delete(view.id))
  rendering.set(view.id, task)
  return task
}
function updateVisiblePages () {
  if (!loaded || printing || !pageViews.length) return
  let closest = Infinity
  for (let i = 0; i < pageViews.length; i++) {
    const rect = pageViews[i].div.getBoundingClientRect()
    const distance = Math.abs(rect.top - 72)
    if (rect.bottom > 56 && distance < closest) { closest = distance; currentPage = i }
  }
  if (document.activeElement !== counter) counter.value = currentPage + 1
  for (let i = 0; i < pageViews.length; i++) {
    const view = pageViews[i]
    if (Math.abs(i - currentPage) <= 2) {
      drawPage(view)
    } else if (view.canvas && !rendering.has(view.id)) {
      // Keep searchable/selectable text and links; release the expensive bitmap.
      view.canvas.width = view.canvas.height = 0
      view.canvas.remove()
      view.canvas = null
    }
  }
}
let scrollTimer
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(updateVisiblePages, 50)
})
const ready = (async () => {
  const task = pdfjsLib.getDocument({ url, withCredentials: true })
  task.onProgress = ({ loaded, total }) => {
    if (total) progress.style.transform = 'translateX(' + (-100 + 100 * loaded / total) + '%)'
  }
  pdf = await task.promise
  linkService.setDocument(pdf)
  total.textContent = pdf.numPages
  const metadata = await pdf.getMetadata().catch(() => ({ info: {} }))
  document.title = metadata.info?.Title || new URL(url).pathname.split('/').pop() || 'PDF'
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const scale = scaleForPage(page)
    const container = document.createElement('div')
    container.className = 'page-container'
    pages.appendChild(container)
    const view = new pdfjsViewer.PDFPageView({
      container, id: number, scale,
      defaultViewport: page.getViewport({ scale }), eventBus,
      layerProperties: { linkService, annotationStorage: pdf.annotationStorage, enableScripting: false }
    })
    view.setPdfPage(page)
    view.div.style.scrollMarginTop = '72px'
    pageViews.push(view)
    if (number <= 3) await drawPage(view)
    else await renderText(view)
  }
  loaded = true
  counter.disabled = false
  counter.value = 1
  progress.hidden = true
  pages.setAttribute('aria-busy', 'false')
  updateVisiblePages()
})().catch(reportError)

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeWork = resizeWork.then(async () => {
    if (!loaded || printing) return
    const selected = currentPage
    await Promise.all([...rendering.values()])
    for (const view of pageViews) {
      const scale = scaleForPage(view.pdfPage)
      if (Math.abs(view.scale - scale) < 0.001) continue
      extraTextLayers.get(view.id)?.cancel()
      extraTextLayers.get(view.id)?.div.remove()
      extraTextLayers.delete(view.id)
      view.update({ scale })
      view.reset()
      if (Math.abs(view.id - 1 - selected) <= 2) await drawPage(view)
      else await renderText(view)
    }
    goToPage(selected + 1)
    }).catch(reportError)
  }, 200)
})
async function startFindInPage () {
  await ready
  for (const view of pageViews) await renderText(view)
  return true
}
function endFindInPage () { updateVisiblePages() }
async function printPDF () {
  await ready
  if (!pdf) return
  // Preserve Min's download fallback for documents too large to print in memory.
  if (pageViews.length > 100) { downloadPDF(); return }
  printing = true
  await Promise.all([...rendering.values()])
  try {
    for (const view of pageViews) {
      printScales.set(view.id, view.scale)
      view.update({ scale: Math.max(view.scale, 3.125 / window.devicePixelRatio) })
      view.reset()
      await drawPage(view)
    }
    window.print()
  } catch (error) {
    restoreAfterPrint()
    reportError(error)
  }
}
function restoreAfterPrint () {
  if (!printing) return
  for (const view of pageViews) {
    view.update({ scale: printScales.get(view.id) || scaleForPage(view.pdfPage) })
    view.reset()
    extraTextLayers.get(view.id)?.cancel()
    extraTextLayers.get(view.id)?.div.remove()
    extraTextLayers.delete(view.id)
  }
  printScales.clear()
  printing = false
  updateVisiblePages()
  startFindInPage().catch(reportError)
}
window.addEventListener('afterprint', restoreAfterPrint)
window.parentProcessActions = { downloadPDF, printPDF, startFindInPage, endFindInPage }
