import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", args);

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(stderr);
    });
  });
}

app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL missing" });

  try {
    const out = await runYtDlp(["-J", url]);
    const json = JSON.parse(out);

    const formats = (json.formats || []).map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      format: f.format,
      filesize: f.filesize,
      url: f.url
    }));

    res.json({
      title: json.title,
      formats
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/download", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL missing" });

  const tmpDir = "./tmp";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const outTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  try {
    await runYtDlp(["-o", outTemplate, url]);

    const files = fs
      .readdirSync(tmpDir)
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(tmpDir, f)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    const file = files[0].name;

    res.json({
      fileUrl: `https://${req.headers.host}/files/${encodeURIComponent(file)}`,
      filename: file,
      size: fs.statSync(path.join(tmpDir, file)).size
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.use("/files", express.static("./tmp"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Backend running on port " + port));
