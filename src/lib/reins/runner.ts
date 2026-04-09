/**
 * REINS runner — adapted from suumo-dashboard/skills/reins.js
 * Returns image buffers in-memory instead of writing to disk.
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
  images: string[] // base64 JPEG
  error?: string
}

export async function fetchMaisokuImages(
  reinsIds: string[],
  chromium: any,
): Promise<FetchResult[]> {
  const loginId = process.env.REINS_LOGIN_ID
  const loginPass = process.env.REINS_LOGIN_PASS
  if (!loginId || !loginPass) throw new Error('REINS credentials not configured')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
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
          results.push({ reinsId, status: 'not_found', images: [] })
          continue
        }

        // Click detail
        await page.click(SEL.result.detailBtn)
        await page.waitForTimeout(5000)

        // Go to image section
        await page.click(SEL.detail.imageSectionBtn)
        await page.waitForTimeout(2000)

        // Screenshot all image cards
        const cards = await page.$$(SEL.detail.imageCard)
        const images: string[] = []

        for (let j = 0; j < cards.length; j++) {
          try {
            const link = await cards[j].$('a')
            if (!link) continue
            await link.click()
            await page.waitForTimeout(2000)

            // Dynamic clip from modal img
            let clip: { x: number; y: number; width: number; height: number } = SEL.imagePopup.clip
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

        console.log(`${tag} ${reinsId} → ${images.length} images`)
        results.push({ reinsId, status: 'success', images })
      } catch (err: any) {
        console.error(`${tag} ${reinsId} → error:`, err.message)
        results.push({ reinsId, status: 'error', images: [], error: err.message })
      }

      // Rate limit
      await page.waitForTimeout(1000)
    }
  } finally {
    await browser.close()
  }

  return results
}
