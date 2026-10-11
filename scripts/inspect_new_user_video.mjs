import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";

async function inspectNewVideo() {
  const videoPath = "C:\\Users\\mahin khan\\OneDrive\\Desktop\\New folder\\onnesha\\New folder\\Screen Recording 2026-10-11 201240.mp4";
  const outputDir = "docs/user_video_analysis_2";
  
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

  const port = 4599;
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`Local video server listening on http://127.0.0.1:${port}/video.mp4`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
        <video id="vid" src="http://127.0.0.1:${port}/video.mp4" playsinline style="max-width: 100%; max-height: 100vh;"></video>
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
    // Sample frames every 2 seconds or at least 20 key points across the video
    const step = Math.max(1.5, duration / 25);
    const timestamps = [];
    for (let t = 0.5; t < duration; t += step) {
      timestamps.push(t);
    }
    if (timestamps[timestamps.length - 1] < duration - 1) {
      timestamps.push(duration - 0.5);
    }

    console.log(`Extracting ${timestamps.length} frames across ${duration.toFixed(1)}s duration...`);

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

      await page.waitForTimeout(400);

      const frameName = `frame_${String(i + 1).padStart(2, "0")}_at_${ts.toFixed(1)}s.png`;
      const framePath = path.join(outputDir, frameName);
      const vidElement = await page.$("#vid");
      if (vidElement) {
        await vidElement.screenshot({ path: framePath });
        console.log(`Saved frame ${i + 1}/${timestamps.length} (${ts.toFixed(1)}s) -> ${framePath}`);
      }
    }
  }

  await browser.close();
  server.close();
  console.log("Video inspection completed successfully.");
}

inspectNewVideo().catch(err => {
  console.error("Error inspecting video:", err);
  process.exit(1);
});
