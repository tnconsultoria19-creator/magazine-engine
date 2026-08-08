import puppeteer from 'puppeteer-core';
import chrome from '@sparticuz/chromium';

export default async function handler(req, res) {
  console.log("=== PUPPETEER DIRECT DOM PDF GENERATION DIAGNOSTICS ===");
  console.log("Request Method:", req.method);
  console.log("Host Header (req.headers.host):", req.headers.host);
  console.log("Forwarded Host (x-forwarded-host):", req.headers['x-forwarded-host']);
  console.log("Vercel Deployment URL (VERCEL_URL):", process.env.VERCEL_URL || "Not Set");
  console.log("Canonical Domain Config (CANONICAL_URL):", process.env.CANONICAL_URL || "Not Set");

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chrome.args,
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath(),
      headless: chrome.headless,
    });

    const page = await browser.newPage();

    await page.setCacheEnabled(false);
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2
    });

    let htmlPayload = null;
    if (req.method === 'POST') {
      if (typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          htmlPayload = parsed.html;
        } catch (e) {
          htmlPayload = req.body;
        }
      } else if (req.body && req.body.html) {
        htmlPayload = req.body.html;
      }
    }

    if (htmlPayload) {
      console.log("Execution Mode: Direct Live DOM Serialization (POST)");
      await page.setContent(htmlPayload, {
        waitUntil: ['load', 'networkidle0'],
        timeout: 30000
      });
    } else {
      console.log("Execution Mode: Fallback URL Navigation (GET)");
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      let targetHost = process.env.CANONICAL_URL 
        ? process.env.CANONICAL_URL.replace(/^https?:\/\//, '')
        : (req.headers['x-forwarded-host'] || req.headers.host || 'magazine-engine.vercel.app');

      if (targetHost.includes(':') && !targetHost.includes('localhost')) {
        targetHost = targetHost.split(':')[0];
      }

      const baseUrl = `${protocol}://${targetHost}`;
      const targetUrl = `${baseUrl}/?render=1&t=${Date.now()}`;

      console.log("Resolved Navigation URL:", targetUrl);
      const navResponse = await page.goto(targetUrl, {
        waitUntil: ['load', 'networkidle0'],
        timeout: 30000
      });
      console.log("Navigation HTTP Status:", navResponse ? navResponse.status() : "No response");
    }

    const finalPageUrl = page.url();
    const pageTitle = await page.title();
    const firstImageSrc = await page.$eval('img', img => img.src).catch(() => "No <img> element found");

    console.log("Puppeteer Final Page URL:", finalPageUrl);
    console.log("Page Title:", pageTitle);
    console.log("First Image Source:", firstImageSrc);
    console.log("===============================================");

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      preferCSSPageSize: true
    });

    const buffer = Buffer.from(pdfBuffer);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Kwanza_Nobre_Magazine.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    return res.end(buffer);

  } catch (error) {
    console.error("Puppeteer PDF Render Failed:", error);
    return res.status(500).json({ 
      error: "PDF Generation Failed", 
      message: error.message 
    });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
}
