const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/generate-preview", upload.single("vehiclePhoto"), async (req, res) => {
  try {
    const description = req.body.description || "a bold custom vinyl sticker/skin design";
    const photoPath = req.file.path;

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: fs.createReadStream(photoPath),
      prompt: `Apply this vehicle sticker/skin design to the vehicle in the photo, keeping the vehicle shape, lighting, and background realistic: ${description}`,
    });

    fs.unlink(photoPath, () => {});

    const imageBase64 = result.data[0].b64_json;
    res.json({ success: true, image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Something went wrong generating the preview." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
