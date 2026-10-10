import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";

async function inspectVideo() {
  const videoPath = "C:\\Users\\mahin khan\\OneDrive\\Desktop\\New folder\\onnesha\\WhatsApp Video 2026-10-1hjfgj1 at 2.04.18 AM.mp4";
  const outputDir = "docs/discharge_video_frames";
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(videoPath)) {
    console.error("Video file does not exist at:", videoPath);
    process.exit(1);
  }

  const fileStats = fs.statSync(videoPath);
  console.log(`Video File Size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);

  // Start local HTTP server to stream the video
  const server = http.createServer((req, res) => {
    if (req.url === "/video.mp4") {
      const range = req.headers.range;
      const fileSize = fileStats.size;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(4567, "127.0.0.1", resolve));
  console.log("Local video server listening on http://127.0.0.1:4567/video.mp4");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
        <video id="vid" src="http://127.0.0.1:4567/video.mp4" playsinline style="max-width: 100%; max-height: 100vh;"></video>
      </body>
    </html>
  `;

  await page.setContent(htmlContent);

  // Wait for loadeddata
  const meta = await page.evaluate(async () => {
    const vid = document.getElementById("vid");
    return new Promise((resolve) => {
      if (vid.readyState >= 2) {
        resolve({
          duration: vid.duration,
          videoWidth: vid.videoWidth,
          videoHeight: vid.videoHeight,
        });
        return;
      }
      vid.onloadeddata = () => {
        resolve({
          duration: vid.duration,
          videoWidth: vid.videoWidth,
          videoHeight: vid.videoHeight,
        });
      };
      vid.onerror = (e) => {
        resolve({ error: "Failed to load video: " + vid.error?.message });
      };
      setTimeout(() => {
        resolve({
          duration: vid.duration || 0,
          videoWidth: vid.videoWidth || 0,
          videoHeight: vid.videoHeight || 0,
          readyState: vid.readyState
        });
      }, 10000);
    });
  });

  console.log("Video Metadata:", JSON.stringify(meta, null, 2));

  if (meta.duration && meta.duration > 0) {
    const duration = meta.duration;
    const timestamps = [
      0.5,
      Math.max(1, duration * 0.25),
      Math.max(2, duration * 0.5),
      Math.max(3, duration * 0.75),
      Math.max(4, duration * 0.95),
    ];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      await page.evaluate(async (time) => {
        const vid = document.getElementById("vid");
        return new Promise((resolve) => {
          vid.currentTime = time;
          vid.onseeked = () => resolve();
          setTimeout(resolve, 3000);
        });
      }, ts);

      // wait 300ms for frame render
      await page.waitForTimeout(300);

      const framePath = path.join(outputDir, `frame_${i + 1}_at_${ts.toFixed(1)}s.png`);
      const vidElement = await page.$("#vid");
      if (vidElement) {
        await vidElement.screenshot({ path: framePath });
        console.log(`Saved frame ${i + 1} at ${ts.toFixed(1)}s to ${framePath}`);
      }
    }
  }

  await browser.close();
  server.close();
  console.log("Video inspection completed successfully.");
}

inspectVideo().catch(err => {
  console.error("Error inspecting video:", err);
  process.exit(1);
});
