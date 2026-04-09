/**
 * REINS runner — downloads 図面 (maisoku) PDFs via the "図面" button
 * in the search results page, NOT screenshots of image cards.
 *
 * Flow: login → number search → click "図面" button → capture PDF download
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const REINS_URLS = {
  login: 'https://system.reins.jp/login/main/KG/GKG001200',
  dashboard: 'https://system.reins.jp/main/KG/GKG003100',
}

const SEL = {
  login: {
    idInput: 'input.p-textbox-input[type="text"]',
    passInput: 'input.p-textbox-input[type="password"]',
    checkbox: 'input.custom-control-input[type="checkbox"]',
    submitBtn: 'button.p-button',
  },
  dashboard: {
    numberSearchBtn: 'button:has-text("物件番号検索")',
  },
  numberSearch: {
    inputs: 'input.p-textbox-input[type="text"]',
    searchBtn: 'button:has-text("検索")',
  },
  result: {
    zumenBtn: 'button:has-text("図面")',
  },
}

export interface FetchResult {
  reinsId: string
  status: 'success' | 'not_found' | 'error'
  pdfs: string[] // base64 PDF data
  error?: string
}

export async function fetchMaisokuPdfs(
  reinsIds: string[],
  chromium: any,
): Promise<FetchResult[]> {
  const loginId = process.env.REINS_LOGIN_ID
  const loginPass = process.env.REINS_LOGIN_PASS
  if (!loginId || !loginPass) throw new Error('REINS credentials not configured')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const results: FetchResult[] = []

  try {
    // --- Login ---
    console.log('[reins] Logging in...')
    await page.goto(REINS_URLS.login, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(2000)
    await page.fill(SEL.login.idInput, loginId)
    await page.waitForTimeout(300)
    await page.fill(SEL.login.passInput, loginPass)
    await page.waitForTimeout(300)

    const cbs = await page.$$(SEL.login.checkbox)
    for (const cb of cbs) {
      if (!(await cb.isChecked())) await cb.click({ force: true })
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(500)
    await page.click(SEL.login.submitBtn)
    await page.waitForTimeout(5000)

    if (!page.url().includes('GKG003100')) {
      throw new Error('REINS login failed')
    }
    console.log('[reins] Login OK')

    // --- Process each ID ---
    for (let i = 0; i < reinsIds.length; i++) {
      const reinsId = reinsIds[i]
      const tag = `[${i + 1}/${reinsIds.length}]`

      try {
        // Navigate to dashboard
        await page.goto(REINS_URLS.dashboard, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(2000)

        // Open number search
        await page.click(SEL.dashboard.numberSearchBtn)
        await page.waitForTimeout(3000)

        // Fill property number
        const inputs = await page.$$(SEL.numberSearch.inputs)
        if (inputs.length === 0) throw new Error('Number input not found')
        await inputs[0].fill(reinsId)
        await page.waitForTimeout(500)
        await page.click(SEL.numberSearch.searchBtn)
        await page.waitForTimeout(5000)

        // Check results
        const hasResults = await page.evaluate(() => !document.body.innerText.includes('検索結果が0件'))
        if (!hasResults) {
          console.log(`${tag} ${reinsId} → not found`)
          results.push({ reinsId, status: 'not_found', pdfs: [] })
          continue
        }

        // Click 図面 button and wait for new page/download
        const pdfs: string[] = []

        // The 図面 button may open a new tab with the PDF, or trigger a download
        const zumenBtn = await page.$(SEL.result.zumenBtn)
        if (!zumenBtn) {
          console.log(`${tag} ${reinsId} → 図面 button not found`)
          results.push({ reinsId, status: 'error', pdfs: [], error: '図面ボタンが見つかりません' })
          continue
        }

        // Try: new page popup (PDF viewer) or download event
        const [newPageOrDownload] = await Promise.all([
          Promise.race([
            context.waitForEvent('page', { timeout: 15000 }).then((p: any) => ({ type: 'page' as const, value: p })),
            page.waitForEvent('download', { timeout: 15000 }).then((d: any) => ({ type: 'download' as const, value: d })),
          ]),
          zumenBtn.click(),
        ])

        if (newPageOrDownload.type === 'page') {
          // New tab opened with PDF
          const newPage = newPageOrDownload.value
          await newPage.waitForTimeout(3000)

          // Try to get PDF from the page URL (direct PDF link)
          const pdfUrl = newPage.url()
          if (pdfUrl && (pdfUrl.includes('.pdf') || pdfUrl.includes('findBkknGzu'))) {
            const response = await context.request.get(pdfUrl)
            const buffer = await response.body()
            pdfs.push(Buffer.from(buffer).toString('base64'))
            console.log(`${tag} ${reinsId} → PDF downloaded from new tab (${buffer.length} bytes)`)
          } else {
            // Page might render PDF inline — take screenshot as fallback
            const buffer = await newPage.pdf().catch(() => null)
            if (buffer) {
              pdfs.push(Buffer.from(buffer).toString('base64'))
              console.log(`${tag} ${reinsId} → PDF captured via page.pdf()`)
            } else {
              console.log(`${tag} ${reinsId} → could not extract PDF from new tab: ${pdfUrl}`)
            }
          }
          await newPage.close()
        } else if (newPageOrDownload.type === 'download') {
          // Direct download
          const download = newPageOrDownload.value
          const buffer = await download.path().then((p: string) => require('fs').readFileSync(p))
          pdfs.push(Buffer.from(buffer).toString('base64'))
          console.log(`${tag} ${reinsId} → PDF downloaded (${buffer.length} bytes)`)
        }

        if (pdfs.length > 0) {
          results.push({ reinsId, status: 'success', pdfs })
        } else {
          results.push({ reinsId, status: 'error', pdfs: [], error: '図面PDFを取得できませんでした' })
        }
      } catch (err: any) {
        console.error(`${tag} ${reinsId} → error:`, err.message)
        results.push({ reinsId, status: 'error', pdfs: [], error: err.message })
      }

      // Rate limit
      await page.waitForTimeout(1000)
    }
  } finally {
    await browser.close()
  }

  return results
}
