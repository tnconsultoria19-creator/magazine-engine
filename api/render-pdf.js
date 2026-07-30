import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  let browser;

  try {
    const host = req.headers.host;

    const protocol =
      host.includes("localhost") || host.startsWith("127.")
        ? "http"
        : "https";

    // Render a clean version of the page
    const targetUrl = `${protocol}://${host}/?render=1`;

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: {
        width: 794,
        height: 1123,
        deviceScaleFactor: 2,
      },
    });

    const page = await browser.newPage();

    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Wait for fonts
    await page.evaluate(async () => {
      if (document.fonts) {
        await document.fonts.ready;
      }
    });

    // Give lazy images/animations time to finish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await page.emulateMediaType("print");

    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });

    const buffer = Buffer.from(pdfData);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="magazine.pdf"'
    );
    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer);

  } catch (err) {
    console.error("PDF generation failed:");
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
