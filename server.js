// server.js
// This is the "backend" you asked about. It's a small Node.js server.
// It does 3 things:
//   1. Serves your upload page (in the /public folder)
//   2. Receives the photo the customer uploads + what design they want
//   3. Sends that to OpenAI's image API to generate a preview, and sends the result back

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const path = require("path");

const app = express();
// Keep the upload in memory instead of writing to disk — simpler and avoids
// losing the file's type information, which is what caused the earlier error.
const upload = multer({ storage: multer.memoryStorage() });

// IMPORTANT: You get this key from platform.openai.com (see README for steps).
// NEVER put your real key directly in this file if you're sharing it publicly.
// On your hosting platform, you'll set this as an "Environment Variable" instead.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// This is the endpoint the upload page calls when the customer clicks "Generate Preview"
app.post("/generate-preview", upload.single("vehiclePhoto"), async (req, res) => {
  try {
    const description = req.body.description || "a bold custom vinyl sticker/skin design";

    // Wrap the uploaded file with its correct filename and type so OpenAI
    // recognizes it as an actual image (this is the fix for the earlier error).
    const image = await toFile(req.file.buffer, req.file.originalname, {
      type: req.file.mimetype,
    });

    // Ask the AI to edit the uploaded photo, adding the described sticker/skin design
    const result = await openai.images.edit({
      model: "gpt-image-1",
      image,
      prompt: `Apply this vehicle sticker/skin design to the vehicle in the photo, keeping the vehicle shape, lighting, and background realistic: ${description}`,
    });

    const imageBase64 = result.data[0].b64_json;
    res.json({ success: true, image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Something went wrong generating the preview." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

