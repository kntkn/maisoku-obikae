/**
 * REINS runner — downloads 図面 PDFs or falls back to image screenshots
 *
 * Flow per property:
 * 1. login → number search → check results
 * 2. Try: click "図面" button → capture PDF download
 * 3. Fallback: click "詳細" → "画像・図面" → screenshot image cards
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
    detailBtn: 'button:has-text("詳細")',
  },
  detail: {
    imageSectionBtn: 'button:has-text("画像・図面")',
    imageCard: '.col-image',
  },
  imagePopup: {
    clip: { x: 237, y: 141, width: 806, height: 634 },
  },
}

export interface FetchResult {
  reinsId: string
  status: 'success' | 'not_found' | 'error'
  pdfs: string[] // base64 PDF or JPEG data
  source: 'zumen' | 'screenshot' | ''
  error?: string
}

export async function fetchMaisokuPdfs(
  reinsIds: string[],
  chromium: any,
): Promise<FetchResult[]> {
  const loginId = process.env.REINS_LOGIN_ID
  const loginPass = process.env.REINS_LOGIN_PASS
  if (!loginId || !loginPass) throw new Error('REINS credentials not configured')

  const browser = await chromium.launch({ headless: false })
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
          results.push({ reinsId, status: 'not_found', pdfs: [], source: '' })
          continue
        }

        // --- Strategy 1: Try 図面 button (direct PDF download) ---
        const zumenBtn = await page.$(SEL.result.zumenBtn)
        if (zumenBtn) {
          const pdfData = await tryZumenDownload(context, page, zumenBtn, tag, reinsId)
          if (pdfData) {
            results.push({ reinsId, status: 'success', pdfs: [pdfData], source: 'zumen' })
            continue
          }
        }

        // --- Strategy 2: Fallback to 詳細 → 画像・図面 → screenshot ---
        console.log(`${tag} ${reinsId} → 図面ボタンなし、画像・図面から取得`)
        const images = await tryImageScreenshots(page, tag, reinsId)
        if (images.length > 0) {
          results.push({ reinsId, status: 'success', pdfs: images, source: 'screenshot' })
        } else {
          results.push({ reinsId, status: 'error', pdfs: [], source: '', error: '図面・画像ともに取得できませんでした' })
        }
      } catch (err: any) {
        console.error(`${tag} ${reinsId} → error:`, err.message)
        results.push({ reinsId, status: 'error', pdfs: [], source: '', error: err.message })
      }

      // Rate limit
      await page.waitForTimeout(1000)
    }
  } finally {
    await browser.close()
  }

  return results
}

// --- Strategy 1: 図面 button → PDF download ---
async function tryZumenDownload(
  context: any, page: any, zumenBtn: any, tag: string, reinsId: string,
): Promise<string | null> {
  try {
    const [newPageOrDownload] = await Promise.all([
      Promise.race([
        context.waitForEvent('page', { timeout: 15000 }).then((p: any) => ({ type: 'page' as const, value: p })),
        page.waitForEvent('download', { timeout: 15000 }).then((d: any) => ({ type: 'download' as const, value: d })),
      ]),
      zumenBtn.click(),
    ])

    if (newPageOrDownload.type === 'page') {
      const newPage = newPageOrDownload.value
      await newPage.waitForTimeout(3000)
      const pdfUrl = newPage.url()

      if (pdfUrl && (pdfUrl.includes('.pdf') || pdfUrl.includes('findBkknGzu'))) {
        const response = await context.request.get(pdfUrl)
        const buffer = await response.body()
        console.log(`${tag} ${reinsId} → PDF via 図面 (${buffer.length} bytes)`)
        await newPage.close()
        return Buffer.from(buffer).toString('base64')
      }
      await newPage.close()
    } else if (newPageOrDownload.type === 'download') {
      const download = newPageOrDownload.value
      const buffer = await download.path().then((p: string) => require('fs').readFileSync(p))
      console.log(`${tag} ${reinsId} → PDF downloaded (${buffer.length} bytes)`)
      return Buffer.from(buffer).toString('base64')
    }
  } catch (err: any) {
    console.log(`${tag} ${reinsId} → 図面DL失敗: ${err.message}`)
  }
  return null
}

// --- Strategy 2: 詳細 → 画像・図面 → screenshot ---
async function tryImageScreenshots(
  page: any, tag: string, reinsId: string,
): Promise<string[]> {
  const images: string[] = []

  try {
    await page.click(SEL.result.detailBtn)
    await page.waitForTimeout(5000)

    await page.click(SEL.detail.imageSectionBtn)
    await page.waitForTimeout(2000)

    const cards = await page.$$(SEL.detail.imageCard)

    for (let j = 0; j < cards.length; j++) {
      try {
        const link = await cards[j].$('a')
        if (!link) continue
        await link.click()
        await page.waitForTimeout(2000)

        // Dynamic clip from modal img
        let clip = SEL.imagePopup.clip
        try {
          const modalImg = await page.$('.modal.show .modal-content img')
          if (modalImg) {
            const box = await modalImg.boundingBox()
            if (box && box.width > 50 && box.height > 50) {
              clip = { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 }
            }
          }
        } catch { /* use fallback clip */ }

        const buffer = await page.screenshot({ type: 'jpeg', quality: 90, clip })
        images.push(Buffer.from(buffer).toString('base64'))

        // Close modal
        const closeBtn = await page.$('.modal.show button:has-text("閉じる")')
        if (closeBtn) {
          await closeBtn.click()
          await page.waitForTimeout(800)
        }
      } catch (err: any) {
        console.error(`${tag} Image ${j + 1} error:`, err.message)
        try {
          const closeBtn = await page.$('.modal.show button:has-text("閉じる")')
          if (closeBtn) await closeBtn.click()
          await page.waitForTimeout(500)
        } catch { /* ignore */ }
      }
    }

    console.log(`${tag} ${reinsId} → ${images.length} screenshots`)
  } catch (err: any) {
    console.error(`${tag} ${reinsId} → screenshot fallback error:`, err.message)
  }

  return images
}
